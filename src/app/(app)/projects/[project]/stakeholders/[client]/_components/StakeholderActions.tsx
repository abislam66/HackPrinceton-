"use client";

import { Check, Copy } from "lucide-react";
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

const ICON = { size: 14, strokeWidth: 1.75, "aria-hidden": true } as const;

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

  const idle = (
    <>
      <Copy {...ICON} />
      Copy link
    </>
  );
  const done = (
    <>
      <Check {...ICON} />
      Copied
    </>
  );

  // Both faces share one grid cell, so the button keeps the wider one's width when the label swaps.
  return (
    <Button variant="tertiary" onClick={copy}>
      <span className="inline-grid justify-items-center">
        <span aria-hidden className="invisible col-start-1 row-start-1 inline-flex items-center gap-1.5">
          {idle}
        </span>
        <span aria-hidden className="invisible col-start-1 row-start-1 inline-flex items-center gap-1.5">
          {done}
        </span>
        <span aria-live="polite" className="col-start-1 row-start-1 inline-flex items-center gap-1.5">
          {copied ? done : idle}
        </span>
      </span>
    </Button>
  );
}
