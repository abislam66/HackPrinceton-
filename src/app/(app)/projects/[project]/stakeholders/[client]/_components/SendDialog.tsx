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
        <div className="flex items-center justify-between gap-6">
          <p className="tm-text--s tm-muted">Gmail isn&apos;t connected yet. Sending marks the proposal as sent.</p>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" compact arrow={false} onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" compact type="submit" form={formId} disabled={pending}>
              {pending ? "Sending" : "Send proposal"}
            </Button>
          </div>
        </div>
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
        <div className="mb-6 flex flex-col gap-3">
          <span className="tm-label tm-muted">To</span>
          <div className="flex items-center gap-3">
            <Avatar name={client.contact.name} />
            <div className="flex min-w-0 flex-col">
              <span className="tm-text--m font-semibold">{client.contact.name}</span>
              <span className="tm-text--s tm-muted">
                {client.contact.title} · {client.company}
              </span>
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

        <div className="mt-6 flex flex-col gap-2 bg-stucco p-4">
          <span className="tm-label">Proposal link</span>
          <span className="truncate font-mono text-sm">/proposals/{client.id}</span>
        </div>

        {error ? (
          <p role="alert" className="tm-text--s mt-4 text-halt">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
