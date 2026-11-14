import { z } from "zod";

/**
 * The scripted replay of the stages before intake: scouting, project analysis and dossier.
 * Nothing here is researched live. The replay ends on the real pre-loaded project and client files,
 * so the fixture only supplies the journey: the candidate projects, the source records and which
 * passage each fact came from.
 */

export const sourceKinds = ["Building permit", "Bid award", "Press"] as const;

/** One public record the replay "reads". Quotes below must appear in `text` word for word. */
export const sourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(sourceKinds),
  /** Who published it, e.g. the permit office or the paper. */
  publisher: z.string(),
  /** As printed on the record, e.g. "Mar 2026". */
  date: z.string(),
  text: z.string(),
});
export type Source = z.infer<typeof sourceSchema>;

/** One project on the scouting list. The demo project's row takes its name from project.json. */
export const scoutRowSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** The demo project's row sets this instead of `name`. */
  isDemoProject: z.boolean().default(false),
  name: z.string().optional(),
  city: z.string(),
  /** Declared job value in US dollars. */
  value: z.number().nonnegative(),
  stage: z.enum(["Permitted", "Bid awarded", "Groundbreaking", "Under construction"]),
  kind: z.enum(sourceKinds),
  /** Higher ranks first. Precomputed: the replay only plays the sort. */
  score: z.number(),
});
export type ScoutRow = z.infer<typeof scoutRowSchema>;

/** Project fields the analysis stage fills, in the order it fills them. */
export const analysisFields = ["buildingType", "scopeType", "timeline", "summary"] as const;
export type AnalysisField = (typeof analysisFields)[number];

export const replaySchema = z.object({
  /** True while the fixture holds placeholder values. The page says so on screen. */
  sample: z.boolean(),
  scouting: z.array(scoutRowSchema).min(2),
  sources: z.array(sourceSchema).min(1),
  /** Where each project field was read from. */
  analysis: z.array(z.object({ field: z.enum(analysisFields), sourceId: z.string(), quote: z.string() })),
  /** Where each client firm was named. `clientId` matches a file in data/<project>/clients/. */
  dossier: z.array(z.object({ clientId: z.string(), sourceId: z.string(), quote: z.string() })),
});
export type Replay = z.infer<typeof replaySchema>;
