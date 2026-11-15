import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunSpec } from "@/lib/agent/run";
import type { ScoutResult } from "./schema";

vi.mock("server-only", () => ({}));

const streamRun = vi.fn((spec: RunSpec<ScoutResult>) => {
  void spec;
  return new Response("stream");
});
const replayRun = vi.fn(async (name: string, committed: string[], speed?: number) => {
  void [name, committed, speed];
  return new Response("replay");
});
vi.mock("@/lib/agent/run", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent/run")>()),
  streamRun: (spec: RunSpec<ScoutResult>) => streamRun(spec),
  replayRun: (name: string, committed: string[], speed?: number) => replayRun(name, committed, speed),
}));

const runScout = vi.fn();
vi.mock("./scout", () => ({ runScout: (...args: unknown[]) => runScout(...args) }));
const loadScoutResult = vi.fn();
vi.mock("./load", () => ({ loadScoutResult: () => loadScoutResult() }));

const runs = await import("@/app/api/scout/runs/route");
const candidates = await import("@/app/api/scout/candidates/route");

const post = (body?: string, query = "") =>
  runs.POST(new Request(`http://localhost/api/scout/runs${query}`, { method: "POST", body }));

describe("POST /api/scout/runs", () => {
  beforeEach(() => {
    streamRun.mockClear();
    replayRun.mockClear();
    runScout.mockReset();
  });

  it("allows 300 s", () => {
    expect(runs.maxDuration).toBe(300);
  });

  it("scouts all five regions for an empty body", async () => {
    const response = await post();
    expect(await response.text()).toBe("stream");
    const spec = streamRun.mock.calls[0][0];
    expect(spec).toMatchObject({ key: "scout", deadlineMs: 150_000, recordAs: "scout.ndjson" });

    runScout.mockResolvedValue("result");
    const signal = new AbortController().signal;
    const progress = () => {};
    await spec.run({ signal, progress });
    expect(runScout).toHaveBeenCalledWith({
      regions: ["new-york", "philadelphia-main-line", "connecticut", "boston", "new-jersey"],
      signal,
      progress,
    });
  });

  it("passes the regions asked for", async () => {
    await post(JSON.stringify({ regions: ["boston"] }));
    await streamRun.mock.calls[0][0].run({ signal: new AbortController().signal, progress: () => {} });
    expect(runScout.mock.calls[0][0].regions).toEqual(["boston"]);
  });

  it("rejects bad input with 400", async () => {
    expect((await post("{not json")).status).toBe(400);
    expect((await post(JSON.stringify({ regions: ["ohio"] }))).status).toBe(400);
    expect((await post(JSON.stringify({ regions: [] }))).status).toBe(400);
    expect(streamRun).not.toHaveBeenCalled();
  });

  it("replays the last recording with ?replay=1", async () => {
    const response = await post(undefined, "?replay=1&speed=2");
    expect(await response.text()).toBe("replay");
    expect(replayRun).toHaveBeenCalledWith("scout.ndjson", ["src/features/scout/recordings/scout.ndjson"], 2);
    expect(streamRun).not.toHaveBeenCalled();
  });
});

describe("GET /api/scout/candidates", () => {
  it("returns the latest result with its source", async () => {
    const data = { runAt: "2026-11-14T10:00:00.000Z", regions: ["boston"], candidates: [], sources: [] };
    loadScoutResult.mockResolvedValueOnce({ source: "store", data });
    const response = await candidates.GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ source: "store", data });
  });

  it("404s when there is no result", async () => {
    loadScoutResult.mockResolvedValueOnce(null);
    const response = await candidates.GET();
    expect(response.status).toBe(404);
    expect(await response.json()).toHaveProperty("error");
  });
});
