import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "./schema";

vi.mock("server-only", () => ({}));

// run.ts writes recordings under process.cwd()/.data; point it at a temp directory.
let tmp = "";
let cwd: ReturnType<typeof vi.spyOn>;
beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "tm-run-"));
  cwd = vi.spyOn(process, "cwd").mockReturnValue(tmp);
});
afterAll(async () => {
  cwd.mockRestore();
  await rm(tmp, { recursive: true, force: true });
});

async function readEvents<T>(response: Response): Promise<RunEvent<T>[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunEvent<T>);
}

describe("streamRun", () => {
  it("streams progress then the result, stores it and records the run", async () => {
    const { streamRun, replayRun } = await import("./run");
    const saved: unknown[] = [];
    const response = streamRun<{ n: number }>({
      key: "test-ok",
      deadlineMs: 5_000,
      run: async ({ progress }) => {
        progress({ kind: "search", message: "Searching: towers", scope: "boston" });
        return { n: 3 };
      },
      save: async (data) => saved.push(data),
      recordAs: "test-ok.ndjson",
    });
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const events = await readEvents<{ n: number }>(response);
    expect(events.map((e) => e.type)).toEqual(["progress", "result"]);
    expect(events[1]).toMatchObject({ type: "result", source: "live", data: { n: 3 } });
    expect(saved).toEqual([{ n: 3 }]);

    // The recording replays with the result marked as a replay.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const replayed = await readEvents<{ n: number }>(await replayRun("test-ok.ndjson", [], 1000));
    expect(replayed.at(-1)).toMatchObject({ type: "result", source: "replay", data: { n: 3 } });
  });

  it("sends the fallback with the error when the run fails", async () => {
    const { streamRun } = await import("./run");
    const events = await readEvents<{ n: number }>(
      streamRun<{ n: number }>({
        key: "test-fail",
        deadlineMs: 5_000,
        run: async () => {
          throw new Error("no key");
        },
        fallback: async () => ({ source: "snapshot", data: { n: 1 } }),
      }),
    );
    expect(events).toEqual([
      expect.objectContaining({ type: "error", message: "no key", fallback: { source: "snapshot", data: { n: 1 } } }),
    ]);
  });

  it("aborts a run that passes its deadline", async () => {
    const { streamRun } = await import("./run");
    const events = await readEvents(
      streamRun({
        key: "test-slow",
        deadlineMs: 30,
        run: ({ signal }) =>
          new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("The run passed its deadline")))),
      }),
    );
    expect(events.at(-1)).toMatchObject({ type: "error", message: "The run passed its deadline", fallback: null });
  });

  it("refuses a second run with the same key while one is going", async () => {
    const { streamRun, isRunning } = await import("./run");
    let release: () => void = () => {};
    const first = streamRun({
      key: "test-busy",
      deadlineMs: 5_000,
      run: () => new Promise<number>((resolve) => (release = () => resolve(1))),
    });
    expect(isRunning("test-busy")).toBe(true);
    const second = streamRun({ key: "test-busy", deadlineMs: 5_000, run: async () => 2 });
    expect(second.status).toBe(409);
    release();
    await first.text();
    expect(isRunning("test-busy")).toBe(false);
  });

  it("returns 404 when there is nothing to replay", async () => {
    const { replayRun } = await import("./run");
    expect((await replayRun("missing.ndjson", ["nowhere/missing.ndjson"])).status).toBe(404);
  });
});
