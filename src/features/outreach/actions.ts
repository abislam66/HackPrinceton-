import "server-only";
import { PROJECT_SLUG } from "@/features/project/schema";
import { markSent } from "@/features/workspace/state";
import { checkDraft, draftEmail, ensureUrl, type DraftSource } from "./draft";
import { normalizeAddress } from "./address";
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
 * A send goes to OUTREACH_DELIVER_TO, never to the stakeholder, unless the operator types a recipient in the
 * send dialog (`to`). Nothing the model writes ever becomes a recipient. gmail.ts refuses anything off
 * OUTREACH_ALLOWLIST either way, so an address only works once someone has put it on that list.
 */

export type DraftOutcome =
  | { status: "ok"; message: OutreachMessage; source: DraftSource }
  | { status: "unknown-client" }
  | { status: "already-sent"; message: OutreachMessage };

export type SendOutcome =
  | { status: "ok" | "failed"; message: OutreachMessage }
  | { status: "no-draft" }
  | { status: "already-sent"; message: OutreachMessage }
  | { status: "not-configured"; reason: string }
  /** The typed recipient is not one plain address, or is not on OUTREACH_ALLOWLIST. Nothing was sent. */
  | { status: "refused"; why: "bad-address" | "not-allowed"; reason: string };

export type EditOutcome =
  | { status: "ok"; message: OutreachMessage; problems: string[] }
  | { status: "no-draft" }
  | { status: "already-sent"; message: OutreachMessage };

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

/**
 * Rewrites the stored draft's subject or body in place, without the model. The proposal link always stays in the
 * body. A sent message is not edited: re-draft it first. Returns the house-rule problems (pricing, scope, length)
 * for the caller to show; they do not block the edit, as an operator's own words win.
 */
export async function editOutreachDraft(
  clientId: string,
  edits: { subject?: string; body?: string },
): Promise<EditOutcome> {
  return withClientLock(clientId, async (): Promise<EditOutcome> => {
    const stored = await getMessage(clientId);
    if (!stored) return { status: "no-draft" };
    if (stored.status === "sent") return { status: "already-sent", message: stored };
    const subject = edits.subject?.trim() || stored.subject;
    const body = ensureUrl(edits.body?.trim() || stored.body, stored.proposalUrl);
    const message = await saveMessage({ ...stored, subject, body, status: "draft", error: null });
    return { status: "ok", message, problems: checkDraft({ subject, body }, stored.proposalUrl) };
  });
}

/** The one line that opens every demo send, naming who the email is really for. */
export function demoLine(intendedFor: OutreachMessage["intendedFor"]): string {
  const who = [intendedFor.name, intendedFor.title, intendedFor.company].filter(Boolean).join(", ");
  return `[Demo send, intended for ${who}. Delivered to the team inbox instead.]`;
}

/**
 * Sends the stored draft through Gmail. By default it goes to OUTREACH_DELIVER_TO as a labelled demo copy. With `to`
 * (the operator typed an address) it goes to that one address as written, if it is on OUTREACH_ALLOWLIST; otherwise
 * it is refused and nothing is sent. A sent message is not sent again unless `resend`. Configuration problems leave
 * the message untouched; a Gmail failure marks it `failed` with the error.
 */
export async function sendOutreach(
  clientId: string,
  opts: { resend?: boolean; edits?: EmailDraft; to?: string } = {},
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
    // An address the operator typed wins over the demo inbox, and is sent as written, with no demo label.
    const typed = opts.to?.trim() ?? "";
    let deliverTo: string | null;
    if (typed) {
      deliverTo = normalizeAddress(typed);
      if (!deliverTo) return { status: "refused", why: "bad-address", reason: "Enter one email address." };
      if (!isAllowedRecipient(deliverTo)) {
        return {
          status: "refused",
          why: "not-allowed",
          reason: `${deliverTo} isn't on OUTREACH_ALLOWLIST, so it can't be sent from here. Add it to the allowlist on the host, or use Open in Gmail to send it yourself.`,
        };
      }
    } else {
      deliverTo = getDeliverTo();
      if (!deliverTo) {
        return { status: "not-configured", reason: "OUTREACH_DELIVER_TO is not set to one email address." };
      }
      if (!isAllowedRecipient(deliverTo)) {
        return { status: "not-configured", reason: "OUTREACH_DELIVER_TO is not on OUTREACH_ALLOWLIST." };
      }
    }

    const subject = typed ? message.subject : `[Demo → ${message.intendedFor.company}] ${message.subject}`;
    const body = typed ? message.body : `${demoLine(message.intendedFor)}\n\n${message.body}`;
    try {
      const sent = await sendEmail({ to: deliverTo, subject, body });
      const sentAt = new Date().toISOString();
      const saved = await saveMessage({
        ...message,
        intendedFor: typed ? { ...message.intendedFor, email: deliverTo } : message.intendedFor,
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
