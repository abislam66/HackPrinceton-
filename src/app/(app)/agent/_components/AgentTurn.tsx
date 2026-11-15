"use client";

import { Check, ChevronRight, CircleAlert, CircleStop, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import type { Turn } from "@/components/chat/useAgentChat";
import { Button } from "@/components/ui/Button";
import { parseReply, type ProjectLink } from "@/features/agent/reply";
import { STOPPED_TEXT, formatElapsed, orderedDestinations, primaryOf, type Run, type RunStatus } from "@/features/agent/runs";
import { cx } from "@/lib/cx";
import { KIND_ICON, RichText, STATUS, elapsedOf, runName, withNums } from "./run-view";

export type AgentTurnProps = {
  turn: Turn;
  now: number;
  pending: boolean;
  /** Runs this prompt started (user turns). */
  runs: Run[];
  /** Results of the prompt this reply answers (assistant turns). */
  resultRuns: Run[];
  links: ProjectLink[];
  lit: boolean;
  flashKey?: number;
  litRun?: string;
  onShowRun: (runId: string) => void;
  onHoverRun: (runId: string | null) => void;
  onFollow: (runId: string) => void;
  onRetry: () => void;
};

/** One turn: a prompt with references to its runs, a reply ending in its result rows, or an error with Retry. */
export function AgentTurn(props: AgentTurnProps) {
  const { turn, now, pending, runs, resultRuns, links, lit, flashKey, litRun, onShowRun, onHoverRun, onFollow, onRetry } = props;
  if (turn.role === "user") {
    return (
      <li data-turn-id={turn.id} className="agent-measure flex flex-col gap-3">
        <Prompt text={turn.text} lit={lit} flashKey={flashKey} />
        {runs.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Runs for this prompt">
            {runs.map((run) => {
              const status = STATUS[run.status];
              const elapsed = formatElapsed(elapsedOf(run, now));
              return (
                <li key={run.id}>
                  <button
                    type="button"
                    className="agent-ref"
                    data-lit={litRun === run.id ? "" : undefined}
                    onClick={() => onShowRun(run.id)}
                    onPointerEnter={() => onHoverRun(run.id)}
                    onPointerLeave={() => onHoverRun(null)}
                    onFocus={() => onHoverRun(run.id)}
                    onBlur={() => onHoverRun(null)}
                    aria-label={`${runName(run)} run, ${status.label}, ${elapsed}. Show in Runs`}
                  >
                    <StatusIcon status={run.status} />
                    <span>{runName(run)} run</span>
                    <span aria-hidden className="text-muted">
                      ·
                    </span>
                    <span>{status.label}</span>
                    <span aria-hidden className="text-muted">
                      ·
                    </span>
                    <span className="app-num text-muted">{elapsed}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </li>
    );
  }

  if (turn.role === "error") {
    const stopped = turn.text === STOPPED_TEXT;
    return (
      <li data-turn-id={turn.id} className="agent-measure">
        <div className="agent-alert" data-kind={stopped ? "stopped" : "error"} role={stopped ? "status" : "alert"}>
          {stopped ? (
            <CircleStop size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 flex-none text-muted" />
          ) : (
            <CircleAlert size={16} strokeWidth={1.75} aria-hidden className="agent-fail-ink mt-0.5 flex-none" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="font-medium">{stopped ? "Stopped" : "The agent couldn't finish"}</p>
            <p className="agent-break text-sm text-muted">{stopped ? turn.text.replace(/^Stopped\.\s*/, "") : turn.text}</p>
          </div>
          <Button variant="secondary" onClick={onRetry} disabled={pending} className="flex-none">
            Retry
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li data-turn-id={turn.id} className="agent-measure flex flex-col gap-4">
      <div className="agent-reply">
        {parseReply(turn.text).map((block, i) =>
          block.type === "paragraph" ? (
            <p key={i}>
              <RichText text={block.text} links={links} />
            </p>
          ) : (
            <ul key={i}>
              {block.items.map((item, j) => (
                <li key={j}>
                  <RichText text={item} links={links} />
                </li>
              ))}
            </ul>
          ),
        )}
      </div>
      {resultRuns.length > 0 ? <ResultRows runs={resultRuns} onFollow={onFollow} /> : null}
    </li>
  );
}

/** Rows shown before the rest fold behind "Show n more". */
const ROW_LIMIT = 4;

/** The reply's attachments: one row per destination, each a single link. Primaries first, then the rest. */
function ResultRows({ runs, onFollow }: { runs: Run[]; onFollow: (runId: string) => void }) {
  const seen = new Set<string>();
  const rows = [
    ...runs.flatMap((run) => {
      const dest = primaryOf(run);
      return dest ? [{ run, dest }] : [];
    }),
    ...runs.flatMap((run) => orderedDestinations(run).slice(1).map((dest) => ({ run, dest }))),
  ].filter(({ dest }) => (seen.has(dest.href) ? false : (seen.add(dest.href), true)));
  const [all, setAll] = useState(false);
  // Folding one row behind a button saves nothing, so fold only when two or more would hide.
  const visible = all || rows.length <= ROW_LIMIT + 1 ? rows : rows.slice(0, ROW_LIMIT);
  const listId = useId();
  return (
    <div className="flex flex-col gap-2">
      <h3 className="sr-only">Results</h3>
      <ul id={listId} className="agent-rows">
        {visible.map(({ run, dest }) => {
          const Icon = KIND_ICON[dest.kind];
          const meta = [dest.subject !== dest.label ? dest.subject : null, dest.summary].filter(Boolean).join(" · ");
          return (
            <li key={`${run.id}-${dest.href}`}>
              <Link href={dest.href} className="agent-row" onClick={() => onFollow(run.id)}>
                <span className="agent-row-icon" aria-hidden>
                  <Icon size={16} strokeWidth={1.75} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{dest.label}</span>
                  {meta ? <span className="truncate text-xs text-muted">{withNums(meta)}</span> : null}
                </span>
                <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="agent-row-chev" />
              </Link>
            </li>
          );
        })}
      </ul>
      {rows.length > ROW_LIMIT + 1 ? (
        <button
          type="button"
          className="agent-more self-start"
          aria-expanded={all}
          aria-controls={listId}
          onClick={() => setAll((a) => !a)}
        >
          {all ? "Show fewer" : `Show ${rows.length - ROW_LIMIT} more`}
        </button>
      ) : null}
    </div>
  );
}

function Prompt({ text, lit, flashKey }: { text: string; lit: boolean; flashKey?: number }) {
  const long = text.split("\n").length > 8 || text.length > 600;
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="agent-prompt" data-lit={lit ? "" : undefined} key={flashKey}>
      <p id={id} className={cx("agent-prompt-text", long && !open && "agent-clamp")}>
        {text}
      </p>
      {long ? (
        <button type="button" className="agent-more" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          {open ? "Show less" : "Show all"}
        </button>
      ) : null}
    </div>
  );
}

function StatusIcon({ status }: { status: RunStatus }) {
  const shared = { size: 14, strokeWidth: 1.75, "aria-hidden": true } as const;
  if (status === "done") return <Check {...shared} className="agent-ref-icon text-muted" />;
  if (status === "failed") return <X {...shared} className="agent-ref-icon agent-fail-ink" />;
  if (status === "stopped") return <CircleStop {...shared} className="agent-ref-icon text-muted" />;
  return <LoaderCircle {...shared} className="agent-ref-icon app-spin" />;
}
