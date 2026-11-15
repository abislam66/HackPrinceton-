"use client";

import { Check, ChevronRight, CircleAlert, CircleStop, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { formatElapsed, isResult, orderedDestinations, primaryOf, type Run } from "@/features/agent/runs";
import { regions } from "@/features/scout/regions";
import { cx } from "@/lib/cx";
import { LANDS_IN, OPEN_LABEL, STATUS, elapsedOf, withNums } from "./run-view";

type StepState = "done" | "failed" | "current" | "stopped";
/** The research runtime words its failures this way ("Search failed (too_many_requests)", "Could not scout …"). */
const FAILED_LINE = /^(search failed|could not|failed)/i;

/** What the step's icon says, for screen readers. */
const STEP_SR: Record<StepState, string> = {
  done: "",
  failed: " (failed)",
  current: " (in progress)",
  stopped: " (stopped here)",
};

function stepState(run: Run, index: number): StepState {
  const last = index === run.steps.length - 1;
  if (FAILED_LINE.test(run.steps[index].message)) return "failed";
  if (last && run.status === "running") return "current";
  if (last && run.status === "stopped") return "stopped";
  return "done";
}

/** One line on a run without a result: its error, where it stopped, or its latest step. */
function outcomeOf(run: Run): string | null {
  if (run.status === "failed") return run.error ?? run.steps.at(-1)?.message ?? null;
  if (run.status === "stopped") return `Stopped after ${run.steps.length} ${run.steps.length === 1 ? "step" : "steps"}`;
  if (run.status === "running") return run.steps.at(-1)?.message ?? "Starting";
  return run.steps.at(-1)?.message ?? null;
}

function noResultReason(run: Run): string {
  if (run.status === "failed") return run.error ?? "The run failed before it produced a result.";
  return (
    "Stopped before it finished, so there is nothing to open here. " +
    "The server may still finish it; ask for the results in a few minutes."
  );
}

const clockTime = (iso: string) => {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

export type RunCardProps = {
  run: Run;
  now: number;
  open: boolean;
  /** This run's Open is the view's one Cone. */
  cone: boolean;
  lit: boolean;
  /** Changes on each "show this run", to replay the highlight. */
  flashKey?: number;
  onToggle: () => void;
  onStop: () => void;
  onShowTurn: () => void;
  onHover: (on: boolean) => void;
  /** The user followed one of its links: the result is read. */
  onFollow: () => void;
};

/** A run in the Runs rail: label, status, elapsed; open, its result (preview and Open) or its steps. */
export function RunCard({ run, now, open, cone, lit, flashKey, onToggle, onStop, onShowTurn, onHover, onFollow }: RunCardProps) {
  const bodyId = useId();
  const status = STATUS[run.status];
  const running = run.status === "running";
  const result = isResult(run);
  const outcome = result ? (primaryOf(run)?.summary ?? null) : outcomeOf(run);
  const [stepsOpen, setStepsOpen] = useState(false);
  const showSteps = !result || stepsOpen;
  const lands = LANDS_IN[run.tool];

  return (
    <li
      data-run-id={run.id}
      className="agent-run"
      data-lit={lit ? "" : undefined}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      <span className="agent-run-flash" key={flashKey} aria-hidden data-on={flashKey ? "" : undefined} />
      <button type="button" className="agent-run-head" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span className="agent-chev" data-open={open ? "" : undefined} aria-hidden>
          <ChevronRight size={16} strokeWidth={1.75} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{run.label}</span>
            <Tag tone={status.tone}>{status.label}</Tag>
            <span className="app-num w-[5ch] flex-none text-right text-xs text-muted">{formatElapsed(elapsedOf(run, now))}</span>
          </span>
          {!open && outcome ? (
            <span className={cx("truncate text-xs", run.status === "failed" ? "agent-fail-ink" : "text-muted")}>
              {withNums(outcome)}
            </span>
          ) : null}
        </span>
      </button>

      {/* A result keeps its Open in reach even when its preview is folded. */}
      {result && !open ? (
        <div className="agent-run-body agent-run-body--folded">
          <ResultActions run={run} cone={cone} onFollow={onFollow} compact />
        </div>
      ) : null}

      {open ? (
        <div id={bodyId} className="agent-run-body">
          {result ? (
            <>
              <ResultPreview run={run} />
              <ResultActions run={run} cone={cone} onFollow={onFollow} />
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted">
                {running ? "Elapsed " : "Took "}
                <span className="app-num text-ink">{formatElapsed(elapsedOf(run, now))}</span>
                {" · "}
                <span className="app-num">{run.steps.length}</span> {run.steps.length === 1 ? "step" : "steps"}
                {running ? " so far" : null}
              </p>
              {running ? (
                <Button variant="secondary" onClick={onStop}>
                  Stop
                </Button>
              ) : null}
            </div>
          )}

          {running && lands ? (
            <p className="agent-landing" aria-disabled="true">
              <span className="font-medium">{lands}</span>
              <span aria-hidden>·</span>
              <span>opens here when ready</span>
            </p>
          ) : null}

          {run.status === "failed" || run.status === "stopped" ? (
            <p className="agent-run-error" data-kind={run.status}>
              {run.status === "failed" ? (
                <CircleAlert size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 flex-none" />
              ) : (
                <CircleStop size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 flex-none" />
              )}
              <span className="agent-break">
                <span className="font-medium">No result. </span>
                {noResultReason(run)}
              </span>
            </p>
          ) : null}

          {result && run.steps.length > 0 ? (
            <button
              type="button"
              className="agent-more self-start"
              aria-expanded={stepsOpen}
              onClick={() => setStepsOpen((o) => !o)}
            >
              {stepsOpen ? "Hide steps" : "Show steps"} <span className="app-num">({run.steps.length})</span>
            </button>
          ) : null}

          {showSteps ? <Steps run={run} /> : null}

          <Button variant="tertiary" onClick={onShowTurn} className="self-start">
            Show prompt
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function Steps({ run }: { run: Run }) {
  const running = run.status === "running";
  const stepsRef = useRef<HTMLOListElement>(null);
  // Follow the newest line while running, unless the user scrolled up to read an earlier one.
  useLayoutEffect(() => {
    const el = stepsRef.current;
    if (!el || !running) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [run.steps.length, running]);

  if (run.steps.length === 0) {
    // Most tools answer in a second and send no progress; only say "waiting" for one still running.
    return running ? <p className="text-xs text-muted">Waiting for the first progress line.</p> : null;
  }
  return (
    <ol ref={stepsRef} className="agent-steps" aria-label={`${run.label} steps`}>
      {run.steps.map((step, i) => {
        const state = stepState(run, i);
        const region = step.scope ? regions[step.scope as keyof typeof regions]?.label : undefined;
        return (
          <li key={i} className="agent-step" data-state={state}>
            <StepIcon state={state} />
            <span className="min-w-0 flex-1">
              {region ? <span className="agent-scope">{region} · </span> : null}
              <span className="agent-break">{withNums(step.message)}</span>
              <span className="sr-only">{STEP_SR[state]}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The result at a glance, by preview type. */
function ResultPreview({ run }: { run: Run }) {
  const dest = primaryOf(run);
  const preview = dest?.preview;
  if (!dest) return null;
  if (!preview) return dest.summary ? <p className="text-xs text-muted">{withNums(dest.summary)}</p> : null;

  if (preview.type === "dossier") {
    return (
      <div className="agent-preview">
        {preview.keyFacts.length > 0 ? (
          <dl className="agent-facts">
            {preview.keyFacts.map((f) => (
              <div key={f.label} className="agent-fact">
                <dt>{f.label}</dt>
                <dd>{withNums(f.value)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="text-xs text-muted">
          <span className="app-num">{preview.firmCount}</span> {preview.firmCount === 1 ? "firm" : "firms"} ·{" "}
          <span className="app-num">{preview.sourceCount}</span> {preview.sourceCount === 1 ? "source" : "sources"}
        </p>
      </div>
    );
  }

  if (preview.type === "model") {
    const when = preview.generatedAt ? clockTime(preview.generatedAt) : null;
    return (
      <div className="agent-preview">
        <p className="agent-preview-lead">
          {dest.subject} · {preview.status === "started" ? "generating" : preview.status}
        </p>
        {when ? (
          <p className="text-xs text-muted">
            Generated <span className="app-num">{when}</span>
          </p>
        ) : null}
      </div>
    );
  }

  if (preview.type === "scout") {
    return (
      <div className="agent-preview">
        <ol className="agent-cands">
          {preview.candidates.map((c) => (
            <li key={c.id} className="agent-cand">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{c.name}</span>
                {c.city ? <span className="truncate text-xs text-muted">{c.city}</span> : null}
              </span>
              <span className="app-num flex-none text-muted" aria-label={`fit ${c.score}`}>
                {c.score}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted">
          <span className="app-num">{preview.total}</span> {preview.total === 1 ? "project" : "projects"} in Discover
        </p>
      </div>
    );
  }

  return (
    <div className="agent-preview">
      <p className="agent-preview-lead agent-clamp-2">{preview.subject}</p>
      <p className="text-xs text-muted">To {preview.to} · draft, not sent</p>
    </div>
  );
}

/** The one Open for a result, plus its other destinations as quiet links. */
function ResultActions({ run, cone, onFollow, compact }: { run: Run; cone: boolean; onFollow: () => void; compact?: boolean }) {
  const [primary, ...rest] = orderedDestinations(run);
  if (!primary) return null;
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant={cone ? "primary" : "secondary"}
        href={primary.href}
        onClick={onFollow}
        className="agent-open self-start"
        aria-label={`${OPEN_LABEL[primary.kind]}: ${primary.label}`}
      >
        {OPEN_LABEL[primary.kind]}
      </Button>
      {!compact && rest.length > 0 ? (
        <ul className="agent-also" aria-label="Also from this run">
          {rest.map((d) => (
            <li key={d.href}>
              <Link href={d.href} className="agent-also-link" onClick={onFollow}>
                <span className="min-w-0 truncate">{d.label}</span>
                {d.summary ? <span className="min-w-0 truncate text-right text-muted">{withNums(d.summary)}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function StepIcon({ state }: { state: StepState }) {
  const shared = { size: 14, strokeWidth: 1.75, "aria-hidden": true } as const;
  if (state === "failed") return <X {...shared} className="agent-step-icon agent-fail-ink" />;
  if (state === "current") return <LoaderCircle {...shared} className="agent-step-icon app-spin" />;
  if (state === "stopped") return <CircleStop {...shared} className="agent-step-icon text-muted" />;
  return <Check {...shared} className="agent-step-icon text-muted" />;
}
