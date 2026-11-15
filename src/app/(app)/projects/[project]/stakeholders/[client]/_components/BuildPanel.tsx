"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Tag } from "@/components/ui/Tag";
import type { BuildStep, UseProposalBuild } from "@/features/workspace/build";
import { formatTime } from "@/features/workspace/format";

/** Ticks once a second while `active`, for elapsed-time readouts. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function elapsed(step: BuildStep, now: number): number | null {
  if (step.startedAt === null) return null;
  return Math.max(0, Math.floor(((step.endedAt ?? now) - step.startedAt) / 1000));
}

function StepState({ status }: { status: BuildStep["status"] }) {
  if (status === "running")
    return (
      <Tag variant="cone" pulse>
        Running
      </Tag>
    );
  if (status === "done") return <Tag variant="go">Done</Tag>;
  if (status === "error") return <Tag variant="halt">Failed</Tag>;
  return <Tag variant="quiet">Queued</Tag>;
}

function StepRow({ step, index, now }: { step: BuildStep; index: number; now: number }) {
  const seconds = elapsed(step, now);
  return (
    <li className="flex items-start gap-3 border-b border-rule/40 py-4 first:pt-0">
      <span className="tm-label tm-num tm-muted mt-0.5 shrink-0">{String(index + 1).padStart(2, "0")}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="tm-text--m font-semibold">{step.label}</span>
        {seconds !== null ? <span className="tm-text--s tm-muted tm-num">{seconds} s</span> : null}
        {step.note ? <p className="tm-text--s tm-muted">{step.note}</p> : null}
      </div>
      <span className="shrink-0">
        <StepState status={step.status} />
      </span>
    </li>
  );
}

/** Side panel while agents run: the steps, a real log, and recovery on error. */
export function BuildPanel({ build }: { build: UseProposalBuild }) {
  const { state } = build;
  const now = useNow(state.phase === "running");
  const logRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.log.length]);

  return (
    <div className="flex flex-col gap-6">
      <Eyebrow>{state.phase === "error" ? "Build stopped" : "Building"}</Eyebrow>
      <ol className="flex flex-col">
        {state.steps.map((step, i) => (
          <StepRow key={step.id} step={step} index={i} now={now} />
        ))}
      </ol>

      {state.phase === "error" && state.error ? (
        <div role="alert" className="flex flex-col gap-4 bg-stucco p-4">
          <p className="tm-text--s">{state.error}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" compact arrow={false} onClick={build.retry}>
              Try again
            </Button>
            {state.kind === "regenerate" ? (
              <Button variant="ghost" compact arrow={false} onClick={build.reset}>
                Back to shots
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="tm-label tm-muted">Live log</h3>
        <ol
          ref={logRef}
          aria-live="polite"
          className="flex max-h-72 flex-col gap-1 overflow-y-auto bg-stucco p-4 font-mono text-xs leading-4 text-ink"
        >
          {state.log.map((line) => (
            <li key={line.id} className="flex gap-2">
              <span className="tm-muted tm-num shrink-0">{formatTime(line.at)}</span>
              <span className="min-w-0 break-words">{line.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
