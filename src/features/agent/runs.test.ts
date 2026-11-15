import { describe, expect, it } from "vitest";
import type { Destination } from "./destinations";
import { formatElapsed, isResult, orderedDestinations, primaryOf, reduceRuns, settleRuns, type Run, type RunEvent } from "./runs";

const dest = (href: string, preview = false): Destination => ({
  kind: "candidate",
  label: href,
  href,
  subject: href,
  ...(preview ? { preview: { type: "scout" as const, candidates: [], total: 0 } } : {}),
});

/** Plays events for turn 1 at t = 0, 1, 2… */
function play(events: RunEvent[], start: Run[] = []): Run[] {
  return events.reduce((runs, e, i) => reduceRuns(runs, e, 1, i), start);
}

describe("reduceRuns", () => {
  it("starts a run on tool, adds steps with scope and kind, and ends it done on its result", () => {
    const runs = play([
      { type: "tool", tool: "get_scout_results", toolUseId: "a" },
      { type: "progress", tool: "get_scout_results", toolUseId: "a", message: "Searching", scope: "boston", kind: "search" },
      { type: "result", tool: "get_scout_results", toolUseId: "a", ok: true, destinations: [dest("/discover")] },
    ]);
    expect(runs).toEqual([
      {
        id: "a",
        turnId: 1,
        tool: "get_scout_results",
        label: "Reading scout results",
        status: "done",
        startedAt: 0,
        endedAt: 2,
        steps: [{ at: 1, message: "Searching", scope: "boston", kind: "search" }],
        destinations: [dest("/discover")],
      },
    ]);
  });

  it("keeps parallel calls of the same tool apart by toolUseId", () => {
    const runs = play([
      { type: "tool", tool: "get_dossier", toolUseId: "a" },
      { type: "tool", tool: "get_dossier", toolUseId: "b" },
      { type: "progress", tool: "get_dossier", toolUseId: "a", message: "for a" },
      { type: "result", tool: "get_dossier", toolUseId: "b", ok: false, error: "no dossier" },
      { type: "result", tool: "get_dossier", toolUseId: "a", ok: true, destinations: [] },
    ]);
    expect(runs.map((r) => [r.id, r.status, r.steps.length, r.error])).toEqual([
      ["a", "done", 1, undefined],
      ["b", "failed", 0, "no dossier"],
    ]);
    expect(runs[0].destinations).toBeUndefined();
  });

  it("falls back to the newest open run of the tool when the stream has no ids", () => {
    const runs = play([
      { type: "tool", tool: "scout_projects" },
      { type: "progress", tool: "scout_projects", message: "Searching" },
    ]);
    expect(runs[0]).toMatchObject({ id: "turn-1-run-1", steps: [{ message: "Searching" }] });
  });

  it("closes runs with no result of their own on the reply, and fails them on an error", () => {
    const open = play([{ type: "tool", tool: "list_projects", toolUseId: "a" }]);
    expect(reduceRuns(open, { type: "reply", text: "Hi" }, 1, 5)[0]).toMatchObject({ status: "done", endedAt: 5 });
    expect(reduceRuns(open, { type: "error", error: "Model failed" }, 1, 5)[0]).toMatchObject({ status: "failed", error: "Model failed" });
  });

  it("ignores duplicates, unknown events and events for finished runs", () => {
    const runs = play([
      { type: "tool", tool: "x", toolUseId: "a" },
      { type: "result", tool: "x", toolUseId: "a", ok: true, destinations: [] },
    ]);
    expect(reduceRuns(runs, { type: "tool", tool: "x", toolUseId: "a" }, 1, 9)).toBe(runs);
    expect(reduceRuns(runs, { type: "progress", tool: "x", toolUseId: "a", message: "late" }, 1, 9)).toBe(runs);
    expect(reduceRuns(runs, { type: "draft" }, 1, 9)).toBe(runs);
  });

  it("only touches the turn it was given", () => {
    const earlier = play([{ type: "tool", tool: "x", toolUseId: "old" }]);
    expect(reduceRuns(earlier, { type: "reply", text: "" }, 2, 9)).toBe(earlier);
  });
});

describe("settleRuns", () => {
  it("marks a turn's open runs stopped and leaves finished ones", () => {
    const runs = play([
      { type: "tool", tool: "x", toolUseId: "a" },
      { type: "result", tool: "x", toolUseId: "a", ok: true, destinations: [] },
      { type: "tool", tool: "y", toolUseId: "b" },
    ]);
    expect(settleRuns(runs, 1, "stopped", 7).map((r) => [r.status, r.endedAt])).toEqual([
      ["done", 1],
      ["stopped", 7],
    ]);
  });
});

describe("results", () => {
  it("picks the destination with a preview as the primary, then the rest in order", () => {
    const run = play([
      { type: "tool", tool: "x", toolUseId: "a" },
      { type: "result", tool: "x", toolUseId: "a", ok: true, destinations: [dest("/1"), dest("/2", true), dest("/3")] },
    ])[0];
    expect(isResult(run)).toBe(true);
    expect(primaryOf(run)?.href).toBe("/2");
    expect(orderedDestinations(run).map((d) => d.href)).toEqual(["/2", "/1", "/3"]);
  });

  it("formats elapsed time", () => {
    expect([formatElapsed(0), formatElapsed(42_400), formatElapsed(185_000), formatElapsed(3_730_000)]).toEqual([
      "0:00",
      "0:42",
      "3:05",
      "1:02:10",
    ]);
  });
});
