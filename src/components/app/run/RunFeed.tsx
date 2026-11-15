"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Tag, type TagTone } from "@/components/ui/Tag";
import { formatClock } from "@/features/workspace/format";
import type { ProgressKind } from "@/lib/agent/schema";
import type { FeedLine, RunPhase, RunState } from "./useRun";

/** Ticks once a second while `active`, for the elapsed readout. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

const PHASE: Record<Exclude<RunPhase, "idle">, { tone: TagTone; label: string }> = {
  running: { tone: "running", label: "Running" },
  done: { tone: "pass", label: "Done" },
  error: { tone: "fail", label: "Failed" },
};

const KIND_LABEL: Record<ProgressKind, string> = {
  search: "Search",
  fetch: "Read",
  found: "Found",
  note: "Agent",
};

/** "0:42" from a run's millisecond offset. */
function offset(at: number): string {
  return formatClock(Math.floor(at / 1000));
}

export function elapsedSeconds(state: RunState<unknown>, now: number): number {
  if (state.startedAt === null) return 0;
  return Math.max(0, Math.floor(((state.endedAt ?? now) - state.startedAt) / 1000));
}

export type RunFeedProps = {
  state: RunState<unknown>;
  /** What the run is doing, e.g. "Scouting five Northeast regions". Shown beside the status. */
  title: string;
  /** One line under the status once the run ends, e.g. "Found 14 projects from 26 sources". */
  summary?: ReactNode;
  /** Extra rows between the status and the log, e.g. scouting's per-region strip. */
  children?: ReactNode;
  /** Prefix for a line's scope, e.g. a region's short name. */
  scopeLabel?: (scope: string) => string | null;
};

/**
 * The "agent at work" panel body: status, elapsed time and the live log of searches, pages read and findings. Matches
 * the stakeholder build's log (BuildPanel). The log is the only part that scrolls, and it follows new lines.
 */
export function RunFeed({ state, title, summary, children, scopeLabel }: RunFeedProps) {
  const running = state.phase === "running";
  const now = useNow(running);
  const logRef = useRef<HTMLOListElement>(null);
  const logTitleId = useId();

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.lines.length]);

  if (state.phase === "idle") return null;
  const phase = PHASE[state.phase];

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="w-[72px] shrink-0">
            <Tag tone={phase.tone}>{phase.label}</Tag>
          </span>
          <span className="min-w-0 flex-1 truncate text-sm leading-[18px] font-semibold">{title}</span>
          {state.replay ? <Tag>Replay</Tag> : null}
          <span className="app-num w-10 shrink-0 text-right text-xs leading-[18px]">
            {formatClock(elapsedSeconds(state, now))}
          </span>
        </div>
        <ProgressBar status={state.phase === "error" ? "error" : running ? "running" : "done"} />
        {state.phase === "error" && state.error ? (
          <p role="alert" className="text-[13px] leading-5 break-words text-status-fail-ink">
            {state.error}
            {state.result ? " Showing the last saved run instead." : null}
          </p>
        ) : summary && state.phase === "done" ? (
          <p className="text-[13px] leading-5 text-muted">{summary}</p>
        ) : null}
      </div>

      {children}

      <section aria-labelledby={logTitleId} className="flex flex-col border-t border-divider">
        <h3 id={logTitleId} className="app-h-section px-5 pt-4 pb-2">
          Live log
        </h3>
        <ol
          ref={logRef}
          aria-live="polite"
          className="max-h-64 min-h-16 overflow-y-auto px-5 pb-4 font-mono text-xs leading-5"
        >
          {state.lines.length === 0 ? (
            <li className="text-muted">{running ? "Starting…" : "Nothing was logged."}</li>
          ) : (
            state.lines.map((line) => <LogLine key={line.id} line={line} scopeLabel={scopeLabel} />)
          )}
        </ol>
      </section>
    </div>
  );
}

function LogLine({ line, scopeLabel }: { line: FeedLine; scopeLabel?: (scope: string) => string | null }) {
  const scope = line.scope && scopeLabel ? scopeLabel(line.scope) : null;
  return (
    <li className="flex gap-3">
      <span className="app-num w-10 shrink-0 text-muted">{offset(line.at)}</span>
      <span className="w-12 shrink-0 text-muted">{KIND_LABEL[line.kind]}</span>
      <span className="min-w-0 break-words">
        {scope ? <span className="text-muted">{scope} · </span> : null}
        {line.message}
      </span>
    </li>
  );
}
