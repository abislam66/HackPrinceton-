import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AgentAbortedError } from "./research";
import type { Progress, ProgressFn, ResultSource, RunEvent } from "./schema";

/*
 * Runs one live stage inside a POST request and streams its progress as NDJSON (one RunEvent
 * per line). The instance holding the stream is the one doing the work, so nothing depends on
 * state shared between serverless instances. The last line carries the whole result.
 *
 * Every run is also recorded with its timings, so `replayRun` can re-stream it later: the screens
 * can be built against a real run, and the demo has a fallback that looks live.
 */

const HEARTBEAT_MS = 10_000;
const RECORDINGS_DIR = path.join(process.cwd(), ".data", "recordings");

export const NDJSON_HEADERS = {
  "content-type": "application/x-ndjson; charset=utf-8",
  "cache-control": "no-store",
  // Stops proxies from buffering the stream.
  "x-accel-buffering": "no",
} as const;

export type RunContext = { signal: AbortSignal; progress: ProgressFn };

export type RunSpec<T> = {
  /** One run per key at a time, e.g. "scout" or "dossier:morgan-hall-north". */
  key: string;
  /** Hard deadline for the whole run. Past it the run is aborted and the fallback is sent. */
  deadlineMs: number;
  run: (ctx: RunContext) => Promise<T>;
  /** Stores a live result. A failure is logged; the client still gets the result. */
  save?: (data: T) => Promise<unknown>;
  /** The last good result, sent with the error when the live run fails. */
  fallback?: () => Promise<{ source: ResultSource; data: T } | null>;
  /** File name for the recording under .data/recordings/, e.g. "scout.ndjson". */
  recordAs?: string;
};

// Keys of runs in progress, on globalThis so dev-server reloads keep the guard.
const globalRuns = globalThis as typeof globalThis & { __tmRunning?: Set<string> };
const running: Set<string> = (globalRuns.__tmRunning ??= new Set());

export function isRunning(key: string): boolean {
  return running.has(key);
}

/**
 * Claims the run key, or returns null when a run with that key is already going (from a route or
 * from the chat agent's tools). Call the returned function when done.
 */
export function claimRun(key: string): (() => void) | null {
  if (running.has(key)) return null;
  running.add(key);
  return () => running.delete(key);
}

function errorMessage(error: unknown): string {
  if (error instanceof AgentAbortedError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

export function streamRun<T>(spec: RunSpec<T>): Response {
  const release = claimRun(spec.key);
  if (!release) {
    return Response.json({ error: `A ${spec.key} run is already in progress` }, { status: 409 });
  }

  const encoder = new TextEncoder();
  const started = Date.now();
  const recorded: RunEvent<T>[] = [];
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const abort = new AbortController();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: RunEvent<T>) => {
        if (event.type !== "heartbeat") recorded.push(event);
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      const at = () => Date.now() - started;
      const progress = (p: Progress) => send({ type: "progress", at: at(), ...p });

      heartbeat = setInterval(() => send({ type: "heartbeat", at: at() }), HEARTBEAT_MS);
      deadline = setTimeout(() => abort.abort(), spec.deadlineMs);

      void (async () => {
        try {
          const data = await spec.run({ signal: abort.signal, progress });
          if (spec.save) {
            await spec.save(data).catch((error) => console.error(`${spec.key}: could not store the result`, error));
          }
          send({ type: "result", at: at(), source: "live", data });
        } catch (error) {
          console.error(`${spec.key}: live run failed`, error);
          const fallback = spec.fallback ? await spec.fallback().catch(() => null) : null;
          send({ type: "error", at: at(), message: errorMessage(error), fallback });
        } finally {
          clearInterval(heartbeat);
          clearTimeout(deadline);
          release();
          if (spec.recordAs) await saveRecording(spec.recordAs, recorded);
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              // Already closed by the client.
            }
          }
        }
      })();
    },
    cancel() {
      // The client went away. The run keeps going so its result is still stored.
      closed = true;
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS });
}

async function saveRecording(name: string, events: RunEvent<unknown>[]): Promise<void> {
  // Only a successful run is worth replaying.
  if (!events.some((e) => e.type === "result")) return;
  try {
    await mkdir(RECORDINGS_DIR, { recursive: true });
    await writeFile(path.join(RECORDINGS_DIR, name), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  } catch {
    // Read-only filesystem (Vercel). The committed recordings still replay.
  }
}

/**
 * Re-streams a recorded run with its original timing (divided by `speed`). Looks in
 * .data/recordings/ first, then in each committed path given. 404 when there is none.
 */
export async function replayRun(name: string, committed: string[], speed = 1): Promise<Response> {
  const candidates = [path.join(RECORDINGS_DIR, name), ...committed.map((p) => path.join(process.cwd(), p))];
  let raw: string | null = null;
  for (const file of candidates) {
    raw = await readFile(file, "utf8").catch(() => null);
    if (raw) break;
  }
  if (!raw) return Response.json({ error: `No recording named ${name}` }, { status: 404 });

  const events = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunEvent<unknown>);
  const factor = speed > 0 ? speed : 1;
  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let previous = 0;
      for (const event of events) {
        if (cancelled) return;
        const wait = Math.max(0, (event.at - previous) / factor);
        previous = event.at;
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        const out = event.type === "result" ? { ...event, source: "replay" as const } : event;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(out)}\n`));
        } catch {
          return;
        }
      }
      controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(stream, { headers: NDJSON_HEADERS });
}

/** Reads a POST route's `?replay=1&speed=2` options. */
export function replayOptions(request: Request): { replay: boolean; speed: number } {
  const params = new URL(request.url).searchParams;
  const speed = Number(params.get("speed") ?? "1");
  return { replay: params.get("replay") === "1", speed: Number.isFinite(speed) && speed > 0 ? speed : 1 };
}
