import { z } from "zod";
import { firmRoles, sourceSchema } from "@/lib/agent/schema";

/*
 * Scouting: real construction projects in the five Northeast regions Tradesmark works in,
 * found live by web research. Every candidate cites at least one page from `sources`.
 * The pre-loaded demo project (Morgan Hall North) is not part of a scout result; the Discover
 * screen adds its row from data/demo-project/project.json.
 */

export const regionIds = ["new-york", "philadelphia-main-line", "connecticut", "boston", "new-jersey"] as const;
export type RegionId = (typeof regionIds)[number];

export const projectStages = ["under-construction", "topped-out", "completed"] as const;
export type ProjectStage = (typeof projectStages)[number];

export const scoutFirmSchema = z.object({
  name: z.string().min(1),
  role: z.enum(firmRoles),
});
export type ScoutFirm = z.infer<typeof scoutFirmSchema>;

export const scoutCandidateSchema = z.object({
  /** URL-safe, stable across runs for the same project, e.g. "the-grove-jersey-city". */
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  /** Street address when a source gives one. */
  address: z.string().nullable(),
  city: z.string(),
  state: z.enum(["NY", "PA", "CT", "MA", "NJ"]),
  region: z.enum(regionIds),
  /** Short, e.g. "32-story residential tower" or "Lab and office building". */
  buildingType: z.string(),
  stage: z.enum(projectStages),
  /** As the sources say it, e.g. "2025" or "Spring 2026". Null when unknown. */
  completion: z.string().nullable(),
  floors: z.number().int().positive().nullable(),
  /** Reported construction cost in US dollars. Null when no source gives one. */
  valueUsd: z.number().nonnegative().nullable(),
  /** One line for the Discover row, from the facts above. */
  whyItFits: z.string(),
  /** Firms named in the sources so far. The dossier fills in the rest. */
  firms: z.array(scoutFirmSchema),
  /** Tradesmark fit, 0-100. Higher ranks first. */
  score: z.number().int().min(0).max(100),
  sourceIds: z.array(z.string().regex(/^S\d+$/)).min(1),
});
export type ScoutCandidate = z.infer<typeof scoutCandidateSchema>;

export const scoutResultSchema = z.object({
  runAt: z.iso.datetime(),
  regions: z.array(z.enum(regionIds)).min(1),
  /** Ranked by score, highest first. */
  candidates: z.array(scoutCandidateSchema),
  sources: z.array(sourceSchema),
});
export type ScoutResult = z.infer<typeof scoutResultSchema>;

/** Body of POST /api/scout/runs. Omit `regions` to scout all five. */
export const scoutRequestSchema = z.object({
  regions: z.array(z.enum(regionIds)).min(1).optional(),
});
