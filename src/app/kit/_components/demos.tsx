"use client";

import { Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { CameraPathPlan, type PlanBounds } from "@/components/ui/CameraPathPlan";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { MediaList, MediaRow } from "@/components/ui/MediaRow";
import { Panel } from "@/components/ui/Panel";
import type { CameraKeyframe } from "@/features/shots/schema";

/** A flag that turns itself off after `ms`: pending, or done. */
function usePending(ms: number): [boolean, () => void] {
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [
    pending,
    () => {
      setPending(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setPending(false), ms);
    },
  ];
}

/** Click to see the pending face: the spinner and "Sending…" at the idle width. */
export function PendingDemo() {
  const [pending, start] = usePending(2000);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary" pending={pending} pendingLabel="Sending…" onClick={start}>
        Send proposal
      </Button>
      <Button pending={pending} pendingLabel="Saving…" onClick={start}>
        Save
      </Button>
      <Button variant="tertiary" pending={pending} onClick={start}>
        <Copy size={14} strokeWidth={1.75} aria-hidden />
        Copy link
      </Button>
    </div>
  );
}

/** Click to see the done face: a check and "Copied" at the idle width, for 1.5 s. */
export function DoneDemo() {
  const [done, start] = usePending(1500);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="tertiary" done={done} doneLabel="Copied" onClick={start}>
        <Copy size={14} strokeWidth={1.75} aria-hidden />
        Copy link
      </Button>
      <Button done={done} doneLabel="Saved" onClick={start}>
        Save draft
      </Button>
    </div>
  );
}

export type DemoShot = {
  id: string;
  name: string;
  /** "01". */
  number: string;
  /** "North face". */
  side: string;
  /** "0:09". */
  duration: string;
  keyframes: CameraKeyframe[];
};

/** The workspace's shot list: 72 px rows led by the camera-path plan, one selected. */
export function ShotListDemo({ shots, footprint }: { shots: DemoShot[]; footprint: PlanBounds }) {
  const [selectedId, setSelectedId] = useState(shots[0]?.id);
  return (
    <Panel title="Shots" count={shots.length} flush className="w-[360px] max-w-full">
      <MediaList as="ol">
        {shots.map((shot) => (
          <MediaRow
            key={shot.id}
            size={72}
            media={<CameraPathPlan keyframes={shot.keyframes} footprint={footprint} />}
            title={shot.name}
            titleLines={2}
            meta={
              <>
                <span className="app-num">{shot.number}</span> · {shot.side}
              </>
            }
            selected={shot.id === selectedId}
            onClick={() => setSelectedId(shot.id)}
          >
            <span className="app-num">{shot.duration}</span>
          </MediaRow>
        ))}
      </MediaList>
      <div className="border-t border-divider px-5 py-3">
        <Button variant="tertiary" className="-ml-3">
          Regenerate shots and pitch
        </Button>
      </div>
    </Panel>
  );
}

export type DemoContact = { name: string; title: string; company: string };

/** The send dialog: a Sheet over the Plaster scrim, two fields, a note and the actions. */
export function DialogDemo({ contact }: { contact: DemoContact }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = usePending(1800);
  const wasPending = useRef(false);

  // Close once the fake send finishes.
  useEffect(() => {
    if (wasPending.current && !pending) setOpen(false);
    wasPending.current = pending;
  }, [pending]);

  return (
    <>
      <div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          Open the send dialog
        </Button>
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        locked={pending}
        title={`Send to ${contact.company}`}
        footer={
          <>
            <p className="text-[13px] leading-[18px] text-muted">Nothing is sent from this page.</p>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="tertiary" disabled={pending} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" pending={pending} pendingLabel="Sending…" onClick={start}>
                Send proposal
              </Button>
            </div>
          </>
        }
      >
        <div className="mb-6 flex items-start gap-3">
          <Avatar name={contact.name} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm font-semibold">{contact.name}</p>
            <p className="text-[13px] leading-[18px] text-muted">
              {contact.title} · {contact.company}
            </p>
          </div>
        </div>
        <Field label="Subject" defaultValue={`A proposal for ${contact.company}`} disabled={pending} />
        <Field
          label="Message"
          multiline
          rows={5}
          defaultValue={`Hi ${contact.name.split(" ")[0]}, we put together a short proposal for your work on the project.`}
          disabled={pending}
        />
      </Dialog>
    </>
  );
}
