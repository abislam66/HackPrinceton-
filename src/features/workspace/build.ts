"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { markBuiltAction } from "./actions";

/*
 * Client-side build orchestration for one stakeholder: Model → Drone shots → Pitch.
 * Every log line records something that actually happened; there is no simulated progress.
 */

export type StepId = "model" | "shots" | "pitch";
export type StepStatus = "queued" | "running" | "done" | "error";
export type BuildStep = {
  id: StepId;
  label: string;
  status: StepStatus;
  startedAt: number | null;
  endedAt: number | null;
  /** Muted note under the step, e.g. "Used the last built model". */
  note: string | null;
};
export type LogLine = { id: number; at: number; text: string };
/** full: all three steps, then mark built. regenerate: shots and pitch only. */
export type BuildKind = "full" | "regenerate";
export type BuildPhase = "idle" | "running" | "error" | "done";
export type BuildState = { kind: BuildKind; phase: BuildPhase; steps: BuildStep[]; log: LogLine[]; error: string | null };

const MODEL_POLL_MS = 1500;
const MODEL_TIMEOUT_MS = 120_000;

const LABELS: Record<StepId, string> = { model: "3D model", shots: "Drone shots", pitch: "Pitch" };

function freshSteps(kind: BuildKind): BuildStep[] {
  const ids: StepId[] = kind === "full" ? ["model", "shots", "pitch"] : ["shots", "pitch"];
  return ids.map((id) => ({ id, label: LABELS[id], status: "queued", startedAt: null, endedAt: null, note: null }));
}

type Action =
  | { type: "start"; kind: BuildKind }
  | { type: "step"; id: StepId; patch: Partial<BuildStep> }
  | { type: "log"; at: number; text: string }
  | { type: "fail"; error: string }
  | { type: "resume" }
  | { type: "done" }
  | { type: "reset" };

const initialState: BuildState = { kind: "full", phase: "idle", steps: freshSteps("full"), log: [], error: null };

function reducer(state: BuildState, action: Action): BuildState {
  switch (action.type) {
    case "start":
      return { kind: action.kind, phase: "running", steps: freshSteps(action.kind), log: [], error: null };
    case "step":
      return { ...state, steps: state.steps.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)) };
    case "log": {
      const id = (state.log.at(-1)?.id ?? 0) + 1;
      return { ...state, log: [...state.log, { id, at: action.at, text: action.text }] };
    }
    case "fail":
      return { ...state, phase: "error", error: action.error };
    case "resume":
      return { ...state, phase: "running", error: null };
    case "done":
      return { ...state, phase: "done" };
    case "reset":
      return initialState;
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {
    // not JSON
  }
  return res.statusText || "no details";
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type BuildStatusBody = { id: string; status: "queued" | "running" | "succeeded" | "failed"; error: string | null };

export type UseProposalBuild = {
  state: BuildState;
  /** Runs Model → Drone shots → Pitch, then marks the stakeholder built. */
  start: () => void;
  /** Reruns drone shots and pitch only. */
  regenerate: () => void;
  /** After an error: reruns from drone shots. */
  retry: () => void;
  /** Leaves an errored run and goes back to the previous view. */
  reset: () => void;
};

export function useProposalBuild({
  clientId,
  company,
  basePath,
}: {
  clientId: string;
  company: string;
  /** The workspace path without a query, e.g. /projects/demo-project/stakeholders/client-a */
  basePath: string;
}): UseProposalBuild {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, initialState);
  const controller = useRef<AbortController | null>(null);
  const kindRef = useRef<BuildKind>("full");

  useEffect(() => () => controller.current?.abort(), []);

  const log = useCallback((text: string) => dispatch({ type: "log", at: Date.now(), text }), []);

  const runModel = useCallback(
    async (signal: AbortSignal) => {
      const startedAt = Date.now();
      dispatch({ type: "step", id: "model", patch: { status: "running", startedAt } });
      log("Model: requesting a build from the model builder");
      let fallback: string | null = null;
      try {
        const res = await fetch("/api/model/builds", { method: "POST", signal });
        if (!res.ok) {
          // The log is on screen during the demo: keep setup details (env vars, stack text) in the console.
          console.warn("Model builder unavailable:", res.status, await readError(res));
          fallback = res.status === 502 ? "model builder offline" : `model builder returned ${res.status}`;
        } else {
          let build = (await res.json()) as BuildStatusBody;
          log(`Model: build ${build.id} ${build.status}`);
          const deadline = startedAt + MODEL_TIMEOUT_MS;
          while (build.status !== "succeeded" && build.status !== "failed") {
            if (Date.now() > deadline) {
              fallback = `build ${build.id} timed out after ${MODEL_TIMEOUT_MS / 1000} s`;
              break;
            }
            await sleep(MODEL_POLL_MS, signal);
            const poll = await fetch(`/api/model/builds/${encodeURIComponent(build.id)}`, { signal, cache: "no-store" });
            if (!poll.ok) {
              fallback = `status check failed (${poll.status}): ${await readError(poll)}`;
              break;
            }
            const next = (await poll.json()) as BuildStatusBody;
            if (next.status !== build.status) log(`Model: build ${next.status}`);
            build = next;
          }
          if (build.status === "failed") fallback = `build failed: ${build.error ?? "no reason given"}`;
        }
      } catch (error) {
        if (signal.aborted) throw error;
        fallback = `could not reach the model builder: ${message(error)}`;
      }
      const endedAt = Date.now();
      if (fallback) {
        log(`Model: ${fallback}`);
        log("Model: used the last built model");
        dispatch({ type: "step", id: "model", patch: { status: "done", endedAt, note: "Used the last built model" } });
      } else {
        log(`Model: built in ${Math.round((endedAt - startedAt) / 1000)} s`);
        dispatch({ type: "step", id: "model", patch: { status: "done", endedAt } });
      }
    },
    [log],
  );

  /** Returns false when generation failed (the state then holds the error). */
  const runGenerate = useCallback(
    async (signal: AbortSignal): Promise<boolean> => {
      const startedAt = Date.now();
      // The server makes the shots, then the pitch, in one request.
      dispatch({ type: "step", id: "shots", patch: { status: "running", startedAt, endedAt: null, note: null } });
      dispatch({ type: "step", id: "pitch", patch: { status: "queued", startedAt: null, endedAt: null, note: null } });
      log(`Shots and pitch: generating for ${company}`);
      try {
        const res = await fetch(`/api/proposals/${encodeURIComponent(clientId)}/generate`, { method: "POST", signal });
        if (!res.ok) throw new Error(`Generation failed (${res.status}): ${await readError(res)}`);
        const source = res.headers.get("x-proposal-source");
        const body = (await res.json()) as { shots?: unknown[] };
        const endedAt = Date.now();
        if (source === "live") log(`Generated live in ${Math.round((endedAt - startedAt) / 1000)} s`);
        else log("Live generation unavailable: loaded the last reviewed proposal");
        if (Array.isArray(body.shots)) log(`Shots: ${body.shots.length} drone shots with captions`);
        dispatch({ type: "step", id: "shots", patch: { status: "done", endedAt } });
        dispatch({
          type: "step",
          id: "pitch",
          patch: { status: "done", note: source === "live" ? null : "Last reviewed version" },
        });
        return true;
      } catch (error) {
        if (signal.aborted) throw error;
        const text = message(error);
        log(`Error: ${text}`);
        dispatch({ type: "step", id: "shots", patch: { status: "error", endedAt: Date.now() } });
        dispatch({ type: "fail", error: text });
        return false;
      }
    },
    [clientId, company, log],
  );

  const run = useCallback(
    async (kind: BuildKind, from: "model" | "shots") => {
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      kindRef.current = kind;
      const { signal } = ctrl;
      try {
        if (from === "model") await runModel(signal);
        if (!(await runGenerate(signal))) return;
        if (kind === "full") {
          log("Saving: marking the proposal built");
          const result = await markBuiltAction(clientId);
          if (signal.aborted) return;
          if (!result.ok) {
            log(`Error: ${result.error}`);
            dispatch({ type: "fail", error: result.error });
            return;
          }
          log("Proposal ready");
          dispatch({ type: "done" });
          router.refresh();
          router.push(`${basePath}?tab=shots`);
        } else {
          log("Shots and pitch updated");
          dispatch({ type: "done" });
          router.refresh();
        }
      } catch (error) {
        if (!signal.aborted) dispatch({ type: "fail", error: message(error) });
      }
    },
    [basePath, clientId, log, router, runGenerate, runModel],
  );

  const start = useCallback(() => {
    dispatch({ type: "start", kind: "full" });
    void run("full", "model");
  }, [run]);

  const regenerate = useCallback(() => {
    dispatch({ type: "start", kind: "regenerate" });
    void run("regenerate", "shots");
  }, [run]);

  const retry = useCallback(() => {
    dispatch({ type: "resume" });
    log("Retrying drone shots and pitch");
    void run(kindRef.current, "shots");
  }, [log, run]);

  const reset = useCallback(() => {
    controller.current?.abort();
    dispatch({ type: "reset" });
  }, []);

  return { state, start, regenerate, retry, reset };
}
