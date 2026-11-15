import type { Destination } from "./destinations";

/*
 * Runs: one per tool call the agent makes, built from the Agent tab's NDJSON stream (chat.ts AgentEvent). A run
 * starts on `tool`, gathers `progress` lines as steps, and ends on its own `result` (done with destinations, or
 * failed). The turn's `reply`, `error` or a stop settles any run still open. Pure, so the hook and the tests share it.
 */

export type RunStatus = "running" | "done" | "failed" | "stopped";

/** One progress line. `scope` (a region id, "firms", "building") and `kind` (search, fetch, found, note) are optional. */
export type RunStep = { at: number; message: string; scope?: string; kind?: string };

export type Run = {
  /** The tool call's id from the model (`toolUseId`), or a local one when the stream has none. */
  id: string;
  /** The user turn that started it. */
  turnId: number;
  tool: string;
  /** Human: "Scouting projects". */
  label: string;
  status: RunStatus;
  startedAt: number;
  endedAt?: number;
  steps: RunStep[];
  /** Why it failed. */
  error?: string;
  /** Where its results live. Only on done runs, and only what the tool returned. */
  destinations?: Destination[];
};

/** The turn a stopped prompt leaves. Stopping only stops the browser reading; the server's work goes on. */
export const STOPPED_TEXT =
  "Stopped. The server may still finish what it started (a scout, dossier or 3D model keeps running there). " +
  "Ask for its results in a few minutes.";

/** Plain-language names for the tools, as a run's title. Unknown tools fall back to their name. */
const RUN_LABELS: Record<string, string> = {
  scout_projects: "Scouting projects",
  get_scout_results: "Reading scout results",
  research_dossier: "Researching a dossier",
  get_dossier: "Reading a dossier",
  list_stakeholders: "Listing stakeholders",
  draft_outreach: "Drafting outreach",
  edit_outreach_draft: "Editing an outreach draft",
  send_outreach: "Sending outreach",
  list_outreach: "Reading the outbox",
  regenerate_proposal: "Re-pitching a proposal",
  list_projects: "Listing projects",
  add_project_from_scout: "Adding a project",
  generate_project_model: "Generating a 3D model",
  get_project_model: "Checking a 3D model",
  get_stakeholder_status: "Reading stakeholder status",
  generate_proposal: "Generating a proposal",
  review_proposal: "Reviewing a proposal",
};

export function runLabel(tool: string): string {
  return RUN_LABELS[tool] ?? tool.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

/** A stream event as the hook reads it. Fields are checked here, so a malformed line is ignored, not trusted. */
export type RunEvent = { type: string } & Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** The run an event belongs to: by its tool call id, else the newest open run of the same tool in the turn. */
function findRun(runs: Run[], turnId: number, toolUseId: string | undefined, tool: string | undefined): number {
  if (toolUseId) {
    const byId = runs.findIndex((r) => r.id === toolUseId);
    if (byId >= 0) return byId;
  }
  return runs.findLastIndex((r) => r.turnId === turnId && r.status === "running" && (!tool || r.tool === tool));
}

/** Ends every open run of a turn: on the reply (done), an error (failed) or a stop (stopped). */
export function settleRuns(
  runs: Run[],
  turnId: number,
  status: Exclude<RunStatus, "running">,
  at: number,
  error?: string,
): Run[] {
  if (!runs.some((r) => r.turnId === turnId && r.status === "running")) return runs;
  return runs.map((r) =>
    r.turnId === turnId && r.status === "running"
      ? { ...r, status, endedAt: at, ...(status === "failed" && error ? { error } : {}) }
      : r,
  );
}

/**
 * Applies one stream event to the chat's runs. `turnId` is the prompt being answered and `at` the time the browser
 * read the event (the stream carries no clock). Returns the same array when nothing changed.
 */
export function reduceRuns(runs: Run[], event: RunEvent, turnId: number, at: number): Run[] {
  const tool = str(event.tool);
  const toolUseId = str(event.toolUseId);
  switch (event.type) {
    case "tool": {
      if (!tool) return runs;
      if (toolUseId && runs.some((r) => r.id === toolUseId)) return runs;
      const id = toolUseId ?? `turn-${turnId}-run-${runs.filter((r) => r.turnId === turnId).length + 1}`;
      return [...runs, { id, turnId, tool, label: runLabel(tool), status: "running", startedAt: at, steps: [] }];
    }
    case "progress": {
      const message = str(event.message);
      const i = findRun(runs, turnId, toolUseId, tool);
      if (!message || i < 0 || runs[i].status !== "running") return runs;
      const step: RunStep = { at, message };
      const scope = str(event.scope);
      const kind = str(event.kind);
      if (scope) step.scope = scope;
      if (kind) step.kind = kind;
      return runs.with(i, { ...runs[i], steps: [...runs[i].steps, step] });
    }
    case "result": {
      const i = findRun(runs, turnId, toolUseId, tool);
      if (i < 0 || runs[i].status !== "running") return runs;
      const run = runs[i];
      if (event.ok === true) {
        const destinations = Array.isArray(event.destinations) ? (event.destinations as Destination[]) : [];
        return runs.with(i, { ...run, status: "done", endedAt: at, ...(destinations.length ? { destinations } : {}) });
      }
      return runs.with(i, { ...run, status: "failed", endedAt: at, error: str(event.error) ?? "The tool failed." });
    }
    case "reply":
      // A run with no result of its own (its input didn't parse, or an older server) ends with the answer.
      return settleRuns(runs, turnId, "done", at);
    case "error":
      return settleRuns(runs, turnId, "failed", at, str(event.error));
    default:
      return runs;
  }
}

/** A run that finished with somewhere to go. */
export const isResult = (run: Run) => run.status === "done" && (run.destinations?.length ?? 0) > 0;

/** The destination a run's Open goes to: the one with a preview, else the first. */
export function primaryOf(run: Run): Destination | undefined {
  return run.destinations?.find((d) => d.preview) ?? run.destinations?.[0];
}

/** Primary first, then the rest in the order the tool gave them. */
export function orderedDestinations(run: Run): Destination[] {
  const primary = primaryOf(run);
  return primary ? [primary, ...(run.destinations ?? []).filter((d) => d !== primary)] : [];
}

/** "0:42", "3:05", "1:02:10" for an elapsed time in ms. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
