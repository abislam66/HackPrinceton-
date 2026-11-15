"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { runEventSchema, type ProgressKind, type ResultSource } from "@/lib/agent/schema";

/*
 * Runs one live research stage (scouting or a dossier) from the browser: POSTs to the stage's run route and reads its
 * NDJSON stream (RunEvent lines, src/lib/agent/schema.ts) into state the screens draw. The server keeps going and
 * stores the result when the page goes away, so leaving mid-run only stops this page from listening.
 */

export type FeedLine = { id: number; at: number; kind: ProgressKind; message: string; scope?: string };

export type RunPhase = "idle" | "running" | "done" | "error";

export type RunState<T> = {
  phase: RunPhase;
  lines: FeedLine[];
  /** Wall-clock start and end, for the elapsed readout. */
  startedAt: number | null;
  endedAt: number | null;
  /** The run's result, or on failure the snapshot it fell back to (`error` says so). */
  result: { source: ResultSource; data: T } | null;
  error: string | null;
  /** True when the run is a replay of the last recorded one. */
  replay: boolean;
};

export type UseRun<T> = { state: RunState<T>; start: (body?: unknown) => void };

const IDLE: RunState<never> = {
  phase: "idle",
  lines: [],
  startedAt: null,
  endedAt: null,
  result: null,
  error: null,
  replay: false,
};

/** The run route with `?replay=1&speed=N` added when the page was opened with `?replay=1`. */
function runUrl(url: string, replay: { speed: number } | null): string {
  if (!replay) return url;
  const params = new URLSearchParams({ replay: "1", speed: String(replay.speed) });
  return `${url}${url.includes("?") ? "&" : "?"}${params}`;
}

async function errorText(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // Not JSON; fall through to the status.
  }
  if (response.status === 409) return "A run is already going. Wait for it to finish, then try again.";
  return `The run could not start (HTTP ${response.status}).`;
}

/**
 * `url` is the stage's POST run route. `data` validates the result. `replay` (from the page's `?replay=1`) re-streams
 * the last recorded run instead of starting a live one.
 */
export function useRun<T>({
  url,
  data,
  replay = null,
}: {
  url: string;
  data: z.ZodType<T>;
  replay?: { speed: number } | null;
}): UseRun<T> {
  const [state, setState] = useState<RunState<T>>(IDLE);
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(
    (body?: unknown) => {
      if (runningRef.current) return;
      runningRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      const eventSchema = runEventSchema(data);
      let nextId = 0;

      setState({ ...IDLE, phase: "running", startedAt: Date.now(), replay: Boolean(replay) });

      const finish = (patch: Partial<RunState<T>>) =>
        setState((s) => ({ ...s, ...patch, endedAt: Date.now() }));

      (async () => {
        try {
          const response = await fetch(runUrl(url, replay), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body ?? {}),
            signal: controller.signal,
          });
          if (!response.ok || !response.body) {
            finish({ phase: "error", error: await errorText(response) });
            return;
          }

          const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = "";
          let ended = false;
          for (;;) {
            const { value: chunk, done } = await reader.read();
            if (done) break;
            buffer += chunk;
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              const parsed = eventSchema.safeParse(JSON.parse(line));
              if (!parsed.success) continue;
              const event = parsed.data;
              if (event.type === "progress") {
                const feedLine: FeedLine = {
                  id: nextId++,
                  // A replay keeps the recording's offsets; scale them so the log agrees with the clock.
                  at: replay ? event.at / replay.speed : event.at,
                  kind: event.kind,
                  message: event.message,
                  scope: event.scope,
                };
                setState((s) => ({ ...s, lines: [...s.lines, feedLine] }));
              } else if (event.type === "result") {
                ended = true;
                finish({ phase: "done", result: { source: event.source, data: event.data as T } });
              } else if (event.type === "error") {
                ended = true;
                finish({
                  phase: "error",
                  error: event.message,
                  result: event.fallback ? { source: event.fallback.source, data: event.fallback.data as T } : null,
                });
              }
            }
          }
          if (!ended) finish({ phase: "error", error: "The run stopped before it finished. Try again." });
        } catch (error) {
          if (controller.signal.aborted) return;
          finish({
            phase: "error",
            error:
              error instanceof SyntaxError
                ? "The run sent something unreadable. Try again."
                : "Couldn't reach the server. Check your connection and try again.",
          });
        } finally {
          runningRef.current = false;
        }
      })();
    },
    [url, data, replay],
  );

  return { state, start };
}
