"use client";

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

/** PageHeader actions for a built stakeholder. Not-built has none: its one CTA is in the viewer. */
export function StakeholderActions({ stage, client, projectName, basePath, opens }: Props) {
  const [sendOpen, setSendOpen] = useState(false);

  const preview = (
    <Button variant="ghost" compact href={`/proposals/${client.id}?preview=1`} target="_blank" rel="noopener noreferrer">
      Preview proposal
    </Button>
  );

  if (stage === "ready") {
    return (
      <>
        {preview}
        <Button variant="primary" compact onClick={() => setSendOpen(true)}>
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
      {opens > 0 ? <Tag variant="go">{`Opened · ${opens}`}</Tag> : <Tag variant="quiet">Sent · not opened</Tag>}
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

  return (
    <Button variant="ghost" compact arrow={false} onClick={copy} aria-live="polite">
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}
