"use client";

import { Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import type { Client } from "@/features/project/schema";
import { SendDialog } from "./SendDialog";

type Props = {
  stage: "ready" | "sent";
  client: Pick<Client, "id" | "company" | "contact">;
  projectName: string;
  basePath: string;
  opens: number;
  sentAt: string | null;
};

/** PageHeader actions for a built stakeholder. Not-built has none: its one primary is in the viewer. */
export function StakeholderActions({ stage, client, projectName, basePath, opens }: Props) {
  const [sendOpen, setSendOpen] = useState(false);

  const preview = (
    <Button variant="secondary" href={`/proposals/${client.id}?preview=1`} target="_blank">
      Preview proposal
    </Button>
  );

  if (stage === "ready") {
    return (
      <>
        {preview}
        <Button variant="primary" onClick={() => setSendOpen(true)}>
          Send proposal
        </Button>
        <SendDialog
          open={sendOpen}
          onClose={() => setSendOpen(false)}
          client={client}
          projectName={projectName}
          basePath={basePath}
        />
      </>
    );
  }

  return (
    <>
      {opens > 0 ? <Tag tone="pass">{`Opened · ${opens}`}</Tag> : <Tag tone="neutral">Sent · not opened</Tag>}
      <CopyLinkButton clientId={client.id} />
      {preview}
    </>
  );
}

function CopyLinkButton({ clientId }: { clientId: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/proposals/${clientId}`);
    } catch {
      return; // clipboard blocked: leave the label as is
    }
    setCopied(true);
    clearTimeout(timer.current ?? undefined);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  // Copied swaps in a check at the same width, and is announced politely.
  return (
    <Button variant="tertiary" done={copied} doneLabel="Copied" onClick={copy}>
      <Copy size={14} strokeWidth={1.75} aria-hidden />
      Copy link
    </Button>
  );
}
