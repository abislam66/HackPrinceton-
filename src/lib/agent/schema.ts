import { z } from "zod";

/*
 * Contracts shared by every live stage (scouting, dossier, outreach). The screens read these
 * shapes from the NDJSON stream and the GET routes, so changing one is a contract change.
 */

/** One web page the research tools actually returned. Facts cite these by `id` ("S1", "S2", ...). */
export const sourceSchema = z.object({
  id: z.string().regex(/^S\d+$/),
  url: z.url(),
  title: z.string(),
  /** Hostname without "www.", e.g. "now.temple.edu". */
  publisher: z.string(),
  /** As the search index reports it, e.g. "3 weeks ago" or "April 4, 2014". Often missing. */
  pageAge: z.string().nullable(),
});
export type Source = z.infer<typeof sourceSchema>;

/** Roles a firm can play on a project. Shared by scouting and the dossier. */
export const firmRoles = [
  "owner",
  "developer",
  "architect",
  "general-contractor",
  "construction-manager",
  "facade",
  "structural-engineer",
  "mep-engineer",
  "landscape-architect",
  "other",
] as const;
export type FirmRole = (typeof firmRoles)[number];

/** Where a stage's result came from. `snapshot` is the committed last good run. */
export const resultSources = ["live", "store", "snapshot", "replay"] as const;
export type ResultSource = (typeof resultSources)[number];

/**
 * One line of a run's NDJSON stream.
 * - `progress`: something the agent did, for the "agent at work" feed.
 * - `heartbeat`: sent every ~10 s so proxies keep the connection open. Ignore it.
 * - `result`: the last line on success. Carries the whole result, so the client can keep it
 *   even when the server could not store it.
 * - `error`: the last line on failure. `fallback` holds the snapshot when there is one.
 */
export const progressKinds = ["search", "fetch", "found", "note"] as const;
export type ProgressKind = (typeof progressKinds)[number];

export function runEventSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion("type", [
    z.object({
      type: z.literal("progress"),
      /** Milliseconds since the run started. */
      at: z.number(),
      kind: z.enum(progressKinds),
      /** One short line for the feed, e.g. "Searching: new residential towers Jersey City 2025". */
      message: z.string(),
      /** Which part of the run, e.g. a region id for scouting. */
      scope: z.string().optional(),
    }),
    z.object({ type: z.literal("heartbeat"), at: z.number() }),
    z.object({ type: z.literal("result"), at: z.number(), source: z.enum(resultSources), data }),
    z.object({
      type: z.literal("error"),
      at: z.number(),
      message: z.string(),
      fallback: z.object({ source: z.enum(resultSources), data }).nullable(),
    }),
  ]);
}

export type RunEvent<T> =
  | { type: "progress"; at: number; kind: ProgressKind; message: string; scope?: string }
  | { type: "heartbeat"; at: number }
  | { type: "result"; at: number; source: ResultSource; data: T }
  | { type: "error"; at: number; message: string; fallback: { source: ResultSource; data: T } | null };

/** What a stage's run reports while it works. `at` is filled in by the runner. */
export type Progress = { kind: ProgressKind; message: string; scope?: string };
export type ProgressFn = (progress: Progress) => void;
