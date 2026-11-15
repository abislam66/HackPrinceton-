import "server-only";
import { PROJECT_SLUG } from "@/features/project/schema";
import { markSent } from "@/features/workspace/state";
import { draftEmail, ensureUrl, type DraftSource } from "./draft";
import { getAccount, getDeliverTo, gmailConfigured, isAllowedRecipient, sendEmail } from "./gmail";
import {
  outreachOverviewSchema,
  type EmailDraft,
  type OutreachMessage,
  type OutreachOverview,
} from "./schema";
import { getMessage, getSyncedAt, listMessages, messageId, saveMessage, syncReplies } from "./store";

/*
 * Outreach as plain functions: the API routes and the chat agent's tools both call these.
 * Every send goes to OUTREACH_DELIVER_TO, never to the stakeholder; nothing the model writes
 * ever becomes a recipient. gmail.ts refuses anything off OUTREACH_ALLOWLIST on top of that.
 */

export type DraftOutcome =
  | { status: "ok"; message: OutreachMessage; source: DraftSource }
  | { status: "unknown-client" }
  | { status: "already-sent"; message: OutreachMessage };

export type SendOutcome =
  | { status: "ok" | "failed"; message: OutreachMessage }
  | { status: "no-draft" }
  | { status: "already-sent"; message: OutreachMessage }
  | { status: "not-configured"; reason: string };

/** How long to skip the account lookup after it failed, so a polling screen does not hammer Google. */
const ACCOUNT_RETRY_MS = 30_000;

type ActionMemory = { locks: Map<string, Promise<unknown>>; accountFailedAt: number };
const globalStore = globalThis as typeof globalThis & { __tmOutreachActions?: ActionMemory };
const memory: ActionMemory = (globalStore.__tmOutreachActions ??= { locks: new Map(), accountFailedAt: 0 });

/** Runs `fn` after any earlier call for the same client finishes, so a double click sends once. */
async function withClientLock<T>(clientId: string, fn: () => Promise<T>): Promise<T> {
  const previous = memory.locks.get(clientId) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const tail = run.catch(() => undefined);
  memory.locks.set(clientId, tail);
  try {
    return await run;
  } finally {
    if (memory.locks.get(clientId) === tail) memory.locks.delete(clientId);
  }
}

/**
 * Drafts (or re-drafts) the email for one stakeholder and stores it as a draft. A message that was
 * already sent is kept unless `force`, because re-drafting replaces it and drops its Gmail thread.
 */
export async function draftOutreach(clientId: string, opts: { force?: boolean } = {}): Promise<DraftOutcome> {
  const existing = await getMessage(clientId);
  if (existing?.status === "sent" && !opts.force) return { status: "already-sent", message: existing };

  const drafted = await draftEmail(clientId);
  if (!drafted) return { status: "unknown-client" };
  const { client, draft, proposalUrl, source } = drafted;

  return withClientLock(clientId, async (): Promise<DraftOutcome> => {
    // A send may have finished while the model was writing.
    const current = await getMessage(clientId);
    if (current?.status === "sent" && !opts.force) return { status: "already-sent", message: current };
    const message = await saveMessage({
      id: messageId(clientId),
      projectSlug: PROJECT_SLUG,
      clientId,
      intendedFor: {
        name: client.contact.name,
        title: client.contact.title || null,
        company: client.company,
        email: null,
      },
      deliveredTo: null,
      subject: draft.subject,
      body: draft.body,
      proposalUrl,
      status: "draft",
      gmailMessageId: null,
      gmailThreadId: null,
      createdAt: new Date().toISOString(),
      sentAt: null,
      error: null,
      replies: [],
    });
    return { status: "ok", message, source };
  });
}

/** The one line that opens every demo send, naming who the email is really for. */
export function demoLine(intendedFor: OutreachMessage["intendedFor"]): string {
  const who = [intendedFor.name, intendedFor.title, intendedFor.company].filter(Boolean).join(", ");
  return `[Demo send, intended for ${who}. Delivered to the team inbox instead.]`;
}

/**
 * Sends the stored draft through Gmail to OUTREACH_DELIVER_TO. A sent message is not sent again
 * unless `resend`. Configuration problems leave the message untouched; a Gmail failure marks it
 * `failed` with the error.
 */
export async function sendOutreach(
  clientId: string,
  opts: { resend?: boolean; edits?: EmailDraft } = {},
): Promise<SendOutcome> {
  return withClientLock(clientId, async (): Promise<SendOutcome> => {
    const stored = await getMessage(clientId);
    if (!stored) return { status: "no-draft" };
    if (stored.status === "sent" && !opts.resend) return { status: "already-sent", message: stored };

    // The operator's edits from the send dialog replace the draft. The proposal link always stays in the body.
    const message = opts.edits
      ? await saveMessage({
          ...stored,
          subject: opts.edits.subject.trim(),
          body: ensureUrl(opts.edits.body.trim(), stored.proposalUrl),
        })
      : stored;

    if (!gmailConfigured()) {
      return {
        status: "not-configured",
        reason: "Gmail is not configured: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GMAIL_REFRESH_TOKEN.",
      };
    }
    const deliverTo = getDeliverTo();
    if (!deliverTo) {
      return { status: "not-configured", reason: "OUTREACH_DELIVER_TO is not set to one email address." };
    }
    if (!isAllowedRecipient(deliverTo)) {
      return { status: "not-configured", reason: "OUTREACH_DELIVER_TO is not on OUTREACH_ALLOWLIST." };
    }

    const subject = `[Demo → ${message.intendedFor.company}] ${message.subject}`;
    const body = `${demoLine(message.intendedFor)}\n\n${message.body}`;
    try {
      const sent = await sendEmail({ to: deliverTo, subject, body });
      const sentAt = new Date().toISOString();
      const saved = await saveMessage({
        ...message,
        status: "sent",
        deliveredTo: deliverTo,
        sentAt,
        gmailMessageId: sent.id,
        gmailThreadId: sent.threadId,
        error: null,
        // A new send is a new thread; the reply sync fills this from it.
        replies: [],
      });
      markSent(clientId, sentAt);
      return { status: "ok", message: saved };
    } catch (error) {
      const reason = (error as Error).message || "The send failed.";
      console.error(`sendOutreach(${clientId}): ${reason}`);
      const saved = await saveMessage({ ...message, status: "failed", error: reason });
      return { status: "failed", message: saved };
    }
  });
}

async function accountOrNull(): Promise<string | null> {
  if (Date.now() - memory.accountFailedAt < ACCOUNT_RETRY_MS) return null;
  try {
    return await getAccount();
  } catch (error) {
    memory.accountFailedAt = Date.now();
    console.error("Outreach overview: could not read the Gmail account.", (error as Error).message);
    return null;
  }
}

/** Gmail status, every message and when replies were last synced. Runs the throttled sync first. */
export async function getOutreachOverview(): Promise<OutreachOverview> {
  const configured = gmailConfigured();
  let account: string | null = null;
  if (configured) {
    await syncReplies();
    account = await accountOrNull();
  }
  const [messages, syncedAt] = await Promise.all([listMessages(), getSyncedAt()]);
  return outreachOverviewSchema.parse({
    gmail: { configured, account, deliverTo: getDeliverTo() },
    messages,
    syncedAt,
  });
}
