"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import type { OutreachMessage, OutreachOverview } from "@/features/outreach/schema";
import { type Client, PROJECT_SLUG } from "@/features/project/schema";
import { sendProposal } from "@/features/workspace/actions";

type Props = {
  open: boolean;
  onClose: () => void;
  projectSlug: string;
  client: Pick<Client, "id" | "company" | "contact">;
  projectName: string;
  basePath: string;
};

/** The 13 px/500 label a Field draws, for the read-only parts of the form. */
const LABEL = "text-[13px] leading-[18px] font-medium";

type Gmail = OutreachOverview["gmail"];

type DraftState =
  | { phase: "loading" }
  // No email for this project: sending only marks the proposal sent.
  | { phase: "mark-only" }
  | { phase: "ready"; message: OutreachMessage; gmail: Gmail }
  | { phase: "error"; error: string };

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  try {
    return (await response.json()) as T & { error?: string };
  } catch {
    return { error: `HTTP ${response.status}` } as T & { error?: string };
  }
}

/** The stakeholder's stored email if there is one, else a fresh draft from POST .../draft. */
async function loadDraft(clientId: string, fresh: boolean): Promise<{ message: OutreachMessage; gmail: Gmail }> {
  const overviewResponse = await fetch("/api/outreach", { cache: "no-store" });
  const overview = await readJson<OutreachOverview>(overviewResponse);
  if (!overviewResponse.ok) throw new Error(overview.error ?? "Couldn't load outreach.");

  const stored = overview.messages.find((m) => m.clientId === clientId);
  if (stored && !fresh) return { message: stored, gmail: overview.gmail };

  const draftResponse = await fetch(`/api/outreach/${encodeURIComponent(clientId)}/draft`, { method: "POST" });
  const drafted = await readJson<OutreachMessage & { message?: OutreachMessage }>(draftResponse);
  // 409: already emailed (from the Agent tab, say). Keep that email rather than replacing it.
  if (draftResponse.status === 409 && drafted.message) return { message: drafted.message, gmail: overview.gmail };
  if (!draftResponse.ok) throw new Error(drafted.error ?? "Couldn't write the email.");
  return { message: drafted, gmail: overview.gmail };
}

/**
 * Sends a built proposal. Opening it writes the email live (Sonnet, from the stakeholder's brief and pitch, about
 * ten seconds) or reopens the stored draft; the operator edits it and sends. With Gmail set up the email goes through
 * Gmail to the allowlisted team inbox, never to the stakeholder; without it, sending only marks the proposal sent.
 * Email covers the demo project's stakeholders only: for a project the agent opened, sending marks it sent.
 */
export function SendDialog({ open, onClose, projectSlug, client, projectName, basePath }: Props) {
  const router = useRouter();
  const formId = useId();
  const [draft, setDraft] = useState<DraftState>({ phase: "loading" });
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const loaded = useRef(false);

  const load = useCallback(
    async (fresh: boolean) => {
      setError(null);
      if (projectSlug !== PROJECT_SLUG) {
        setDraft({ phase: "mark-only" });
        return;
      }
      setDraft({ phase: "loading" });
      try {
        const { message, gmail } = await loadDraft(client.id, fresh);
        setDraft({ phase: "ready", message, gmail });
        setSubject(message.subject);
        setBody(message.body);
      } catch (e) {
        setDraft({ phase: "error", error: e instanceof Error ? e.message : "Couldn't write the email." });
      }
    },
    [projectSlug, client.id],
  );

  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    void load(false);
  }, [open, load]);

  const ready = draft.phase === "ready" ? draft : null;
  const markOnly = draft.phase === "mark-only";
  const alreadyEmailed = ready?.message.status === "sent";
  const emails = Boolean(ready?.gmail.configured) && !alreadyEmailed;

  const send = () => {
    if (!ready && !markOnly) return;
    setError(null);
    startTransition(async () => {
      if (emails) {
        const response = await fetch(`/api/outreach/${encodeURIComponent(client.id)}/send`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subject, body }),
        });
        const result = await readJson<OutreachMessage>(response);
        if (!response.ok && response.status !== 409) {
          setError(result.error ?? "The email didn't send. Try again.");
          return;
        }
      }
      const marked = await sendProposal(projectSlug, client.id);
      if (!marked.ok) {
        setError(emails ? `The email went out, but the proposal wasn't marked sent: ${marked.error}` : marked.error);
        return;
      }
      onClose();
      router.push(`${basePath}?tab=engagement`);
      router.refresh();
    });
  };

  const footerNote = markOnly
    ? "This project's proposals aren't emailed, so this only marks the proposal as sent."
    : !ready
    ? "Writing the email from the stakeholder's brief and pitch…"
    : alreadyEmailed
      ? "This email already went out. Sending marks the proposal as sent."
      : ready.gmail.configured
        ? `Sends through Gmail to ${ready.gmail.deliverTo ?? "the team inbox"}, never to the stakeholder.`
        : "Gmail isn't connected, so this only marks the proposal as sent.";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      locked={pending}
      title="Send proposal"
      footer={
        <>
          <p className="text-[13px] leading-[18px] text-muted">{footerNote}</p>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="tertiary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form={formId}
              disabled={!ready && !markOnly}
              pending={pending}
              pendingLabel="Sending…"
            >
              {emails ? "Send proposal" : "Mark as sent"}
            </Button>
          </div>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="flex flex-col"
      >
        <div className="mb-5 flex flex-col gap-2">
          <p className={LABEL}>To</p>
          <div className="flex items-center gap-3">
            <Avatar name={client.contact.name} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="truncate text-sm leading-5 font-semibold">{client.contact.name}</p>
              <p className="truncate text-[13px] leading-[18px] text-muted">
                {client.contact.title} · {client.company}
              </p>
            </div>
          </div>
        </div>

        {markOnly ? null : draft.phase === "error" ? (
          <div role="alert" className="mb-5 flex flex-col items-start gap-3">
            <p className="text-[13px] leading-5 text-status-fail-ink">{draft.error}</p>
            <Button onClick={() => void load(false)}>Try again</Button>
          </div>
        ) : (
          <>
            <Field
              label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={!ready || pending || alreadyEmailed}
              placeholder={ready ? undefined : "Writing…"}
            />
            <Field
              label="Message"
              multiline
              rows={9}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={!ready || pending || alreadyEmailed}
              placeholder={ready ? undefined : `Writing an email to ${client.contact.name} about ${projectName}…`}
            />
            <div className="mt-2 flex justify-end">
              <Button
                variant="tertiary"
                onClick={() => void load(true)}
                disabled={!ready || pending || alreadyEmailed}
              >
                Write it again
              </Button>
            </div>
          </>
        )}

        <div className="mt-3 flex flex-col gap-2">
          <p className={LABEL}>Proposal link</p>
          <p className="truncate font-mono text-[13px] leading-[18px] text-muted">
            {ready?.message.proposalUrl ?? `/proposals/${client.id}`}
          </p>
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-[13px] leading-[18px] text-status-fail-ink">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
