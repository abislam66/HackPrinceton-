"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import type { Client } from "@/features/project/schema";
import { sendProposal } from "@/features/workspace/actions";

type Props = {
  open: boolean;
  onClose: () => void;
  client: Pick<Client, "id" | "company" | "contact">;
  projectName: string;
  basePath: string;
};

/** The 13 px/500 label a Field draws, for the read-only parts of the form. */
const LABEL = "text-[13px] leading-[18px] font-medium";

function defaultMessage(contactName: string, projectName: string, company: string): string {
  return [
    `Hi ${contactName},`,
    "",
    `We put together a short proposal for ${company} on ${projectName}. It opens with a fly-up of the building, then walks through the shots Tradesmark would film for you.`,
    "",
    "Have a look when you have a minute.",
  ].join("\n");
}

export function SendDialog({ open, onClose, client, projectName, basePath }: Props) {
  const router = useRouter();
  const formId = useId();
  const [subject, setSubject] = useState(`${projectName}, on film for ${client.company}`);
  const [message, setMessage] = useState(() => defaultMessage(client.contact.name, projectName, client.company));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const send = () => {
    setError(null);
    startTransition(async () => {
      const result = await sendProposal(client.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.push(`${basePath}?tab=engagement`);
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      locked={pending}
      title="Send proposal"
      footer={
        <>
          <p className="text-[13px] leading-[18px] text-muted">
            Gmail isn&apos;t connected yet. Sending marks the proposal as sent.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="tertiary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form={formId} pending={pending} pendingLabel="Sending…">
              Send proposal
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

        <Field label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={pending} />
        <Field
          label="Message"
          multiline
          rows={7}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={pending}
        />

        <div className="mt-5 flex flex-col gap-2">
          <p className={LABEL}>Proposal link</p>
          <p className="truncate font-mono text-[13px] leading-[18px] text-muted">/proposals/{client.id}</p>
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
