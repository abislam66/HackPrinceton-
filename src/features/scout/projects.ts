import "server-only";
import { z } from "zod";
import { PROJECT_SLUG } from "@/features/project/schema";
import { listRecords, readRecord, writeRecord } from "@/lib/store/json-store";
import { loadScoutResult } from "./load";
import { scoutCandidateSchema, type ScoutCandidate } from "./schema";

/*
 * Projects added from scouting: a building the scout found, kept as a project so the team can research its dossier
 * and generate its model. The project id is the candidate id, so its dossier (stored under that id) comes with it.
 * The candidate is copied in, so the project survives a later scout run that no longer finds it.
 *
 * Held in the shared json store (.data/, gitignored; memory on Vercel), like the project agent's projects.
 * The pre-loaded demo project is never one of these.
 */

const COLLECTION = "scouted-projects";

export const scoutedProjectSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  candidate: scoutCandidateSchema,
  addedAt: z.iso.datetime(),
});
export type ScoutedProject = z.infer<typeof scoutedProjectSchema>;

export type AddOutcome =
  | { status: "added" | "exists"; project: ScoutedProject }
  | { status: "unknown-candidate" }
  | { status: "reserved" };

export async function getScoutedProject(id: string): Promise<ScoutedProject | null> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || id === PROJECT_SLUG) return null;
  return readRecord(COLLECTION, id, scoutedProjectSchema);
}

/** Every project added from scouting, oldest first. */
export async function listScoutedProjects(): Promise<ScoutedProject[]> {
  const projects = await listRecords(COLLECTION, scoutedProjectSchema);
  return projects.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

/** Adds the scout candidate as a project. Adding one twice returns the first, unchanged. */
export async function addScoutedProject(candidateId: string): Promise<AddOutcome> {
  if (candidateId === PROJECT_SLUG) return { status: "reserved" };
  const existing = await getScoutedProject(candidateId);
  if (existing) return { status: "exists", project: existing };

  const scout = await loadScoutResult();
  const candidate: ScoutCandidate | undefined = scout?.data.candidates.find((c) => c.id === candidateId);
  if (!candidate) return { status: "unknown-candidate" };

  const project: ScoutedProject = { id: candidate.id, candidate, addedAt: new Date().toISOString() };
  await writeRecord(COLLECTION, project.id, scoutedProjectSchema.parse(project));
  return { status: "added", project };
}
