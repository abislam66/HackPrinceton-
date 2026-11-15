"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Tag, type TagTone } from "@/components/ui/Tag";
import type { BuildStep, StepStatus, UseProposalBuild } from "@/features/workspace/build";
import { formatClock, formatTime } from "@/features/workspace/format";

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

const STATUS: Record<StepStatus, { tone: TagTone; label: string }> = {
  queued: { tone: "neutral", label: "Queued" },
  running: { tone: "running", label: "Running" },
  done: { tone: "pass", label: "Done" },
  error: { tone: "fail", label: "Failed" },
};

function StepRow({ step, index, now }: { step: BuildStep; index: number; now: number }) {
  const seconds = elapsed(step, now);
  const status = STATUS[step.status];
  return (
    <li className="flex items-start gap-3 px-5 py-4">
      <span className="app-num shrink-0 text-xs leading-[18px] text-muted">{String(index + 1).padStart(2, "0")}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="truncate text-sm leading-[18px] font-semibold">{step.label}</span>
        <ProgressBar status={step.status} />
        {step.note ? <span className="text-xs leading-4 text-muted">{step.note}</span> : null}
      </span>
      <span className="app-num w-10 shrink-0 text-right text-xs leading-[18px]">
        {seconds === null ? null : formatClock(seconds)}
      </span>
      <span className="w-[72px] shrink-0">
        <Tag tone={status.tone}>{status.label}</Tag>
      </span>
    </li>
  );
}

/**
 * The side panel's body while agents run, under a "Building" header: the steps, a real log, and recovery on error.
 * The log takes the panel's spare height and is the only part that scrolls.
 */
export function BuildPanel({ build }: { build: UseProposalBuild }) {
  const { state } = build;
  const now = useNow(state.phase === "running");
  const logRef = useRef<HTMLOListElement>(null);
  const logTitleId = useId();

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.log.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ol aria-label="Build steps" className="shrink-0 divide-y divide-divider">
        {state.steps.map((step, i) => (
          <StepRow key={step.id} step={step} index={i} now={now} />
        ))}
      </ol>

      {state.phase === "error" && state.error ? (
        <div role="alert" className="flex shrink-0 flex-col gap-3 border-t border-divider px-5 py-4">
          <p className="text-[13px] leading-5 break-words text-status-fail-ink">{state.error}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={build.retry}>
              Try again
            </Button>
            {state.kind === "regenerate" ? (
              <Button variant="tertiary" onClick={build.reset}>
                Back to shots
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <section aria-labelledby={logTitleId} className="flex min-h-0 flex-1 flex-col border-t border-divider">
        <h3 id={logTitleId} className="app-h-section shrink-0 px-5 pt-4 pb-2">
          Live log
        </h3>
        <ol
          ref={logRef}
          aria-live="polite"
          className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 font-mono text-xs leading-5"
        >
          {state.log.map((line) => (
            <li key={line.id} className="flex gap-3">
              <span className="app-num shrink-0 text-muted">{formatTime(line.at)}</span>
              <span className="min-w-0 break-words">{line.text}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
