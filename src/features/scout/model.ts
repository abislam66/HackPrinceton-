import "server-only";
import { z } from "zod";
import type { ViewerInput } from "@/features/building-viewer/schema";
import type { Dossier } from "@/features/dossier/schema";
import { readRecord, writeRecord } from "@/lib/store/json-store";
import { STAGE_LABEL } from "@/lib/labels";
import type { ScoutedProject } from "./projects";

/*
 * A scouted project's 3D model: the building viewer generator (src/features/building-viewer/, Abrar's) run on the
 * project's address and what scouting and the dossier know about it. The pre-loaded demo project keeps its own model
 * from the model builder; this is for buildings we have no files for. The generated viewer is stored per project.
 */

const COLLECTION = "project-models";

export const projectModelSchema = z.object({
  projectId: z.string().regex(/^[a-z0-9-]+$/),
  /** A self-contained HTML page: the viewer. Shown in a sandboxed iframe. */
  html: z.string().min(1),
  /** What the model said about the building and its assumptions. */
  reply: z.string(),
  geocodeStatus: z.string(),
  contextStatus: z.string(),
  /** True when the model changed locked scaffold code and the locked scaffold was used. */
  drift: z.boolean(),
  generatedAt: z.iso.datetime(),
});
export type ProjectModel = z.infer<typeof projectModelSchema>;

export async function loadProjectModel(projectId: string): Promise<ProjectModel | null> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(projectId)) return null;
  return readRecord(COLLECTION, projectId, projectModelSchema);
}

export async function saveProjectModel(model: ProjectModel): Promise<void> {
  await writeRecord(COLLECTION, model.projectId, projectModelSchema.parse(model));
}

/** Joins lines and cuts the text at `max` characters on a line break, so a fact is never cut in half. */
function fit(lines: string[], max: number): string {
  let out = "";
  for (const line of lines) {
    const next = out ? `${out}\n${line}` : line;
    if (next.length > max) break;
    out = next;
  }
  return out;
}

/**
 * The viewer generator's form, filled from the project. Limits are the form's (viewerFormSchema): address 200,
 * name 120, known facts 500, notes 1000 characters.
 */
export function viewerInputFor(project: ScoutedProject, dossier: Dossier | null): ViewerInput {
  const c = project.candidate;
  const street = dossier?.address ?? c.address;
  const address = [street ?? c.name, c.city, c.state].join(", ").slice(0, 200);

  const known = [
    c.buildingType,
    c.floors ? `${c.floors} floors above ground` : null,
    `${STAGE_LABEL[c.stage]}${c.completion ? `, completion ${c.completion}` : ""}`,
    ...(dossier?.keyFacts ?? []).map((f) => `${f.label}: ${f.value}`),
  ].filter((line): line is string => Boolean(line));

  const notes = [
    ...(dossier ? [dossier.summary.text] : [c.whyItFits]),
    ...(dossier?.building ?? []).map((f) => `${f.label}: ${f.value}`),
  ];

  return {
    address,
    buildingName: c.name.slice(0, 120),
    knownFacts: fit(known, 500),
    notes: fit(notes, 1000),
  };
}
