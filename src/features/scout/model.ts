import "server-only";
import { after } from "next/server";
import { z } from "zod";
import { generateViewer, StepError, type GeneratedViewer } from "@/features/building-viewer/generate";
import { takeGeneration } from "@/features/building-viewer/guard";
import type { ViewerEvent, ViewerInput } from "@/features/building-viewer/schema";
import { loadDossier } from "@/features/dossier/load";
import type { Dossier } from "@/features/dossier/schema";
import { saveGeneratedBuilding } from "@/features/model/generated";
import { claimRun } from "@/lib/agent/run";
import { readRecord, writeRecord } from "@/lib/store/json-store";
import { STAGE_LABEL } from "@/lib/labels";
import type { ScoutedProject } from "./projects";

/*
 * A scouted project's 3D model: the building viewer generator (src/features/building-viewer/, Abrar's) run on the
 * project's address and what scouting and the dossier know about it. The pre-loaded demo project keeps its own model
 * from the model builder; this is for buildings we have no files for.
 *
 * A run stores two things per project: the viewer page (collection "project-models", for the Model tab) and the GLB
 * with model.json (features/model/generated.ts, for the Shots viewer and the shot compiler). It starts by itself when a
 * project is added from scouting, and again from the Model tab or the agent. Its status is a record too
 * ("project-model-runs"), so every server instance and page load sees a run in progress.
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
    projectSlug: project.id,
  };
}

// Runs.

const RUNS = "project-model-runs";
/** A run that has said "generating" for longer than this died with its instance (the routes stop at 300 s). */
export const STALE_RUN_MS = 310 * 1000;

export const modelRunSchema = z.object({
  projectId: z.string(),
  status: z.enum(["generating", "ready", "failed"]),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().optional(),
  /** Why it failed, in the operator's words. */
  error: z.string().optional(),
});
export type ModelRun = z.infer<typeof modelRunSchema>;

/** The project's latest run. A "generating" run past STALE_RUN_MS reads as failed. */
export async function loadModelRun(projectId: string, now = Date.now()): Promise<ModelRun | null> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(projectId)) return null;
  const run = await readRecord(RUNS, projectId, modelRunSchema).catch(() => null);
  if (run?.status === "generating" && now - Date.parse(run.startedAt) > STALE_RUN_MS) {
    return { ...run, status: "failed", error: "The run stopped before it finished. Generate again." };
  }
  return run;
}

async function recordRun(run: ModelRun): Promise<void> {
  await writeRecord(RUNS, run.projectId, modelRunSchema.parse(run)).catch((error) =>
    console.error(`project model ${run.projectId}: could not record the run status`, (error as Error).message),
  );
}

/**
 * Generates the project's model and stores it: the viewer page and the GLB. Records the run's status as it goes.
 * Throws StepError (or another error) after recording the failure. The caller takes the rate limit and the run lock.
 */
export async function runProjectModel(project: ScoutedProject, emit: (event: ViewerEvent) => void = () => {}): Promise<GeneratedViewer> {
  const startedAt = new Date().toISOString();
  await recordRun({ projectId: project.id, status: "generating", startedAt });
  try {
    const dossier = await loadDossier(project.id);
    const generated = await generateViewer(viewerInputFor(project, dossier?.data ?? null), null, emit);
    const { result } = generated;
    // The GLB first: it is what the Shots tab and the proposal show. The page is for the Model tab.
    await saveGeneratedBuilding(project.id, generated);
    await saveProjectModel({
      projectId: project.id,
      html: result.html,
      reply: result.reply,
      geocodeStatus: result.geocode_status,
      contextStatus: result.context_status,
      drift: result.drift,
      generatedAt: new Date().toISOString(),
    });
    result.model_saved = true;
    await recordRun({ projectId: project.id, status: "ready", startedAt, finishedAt: new Date().toISOString() });
    console.info(`project model ${project.id}: saved (${generated.glb.length} bytes, ${generated.obstacles.length} neighbours)`);
    return generated;
  } catch (error) {
    const message = error instanceof StepError ? error.message : "Generating the model failed. Try again.";
    if (!(error instanceof StepError)) console.error(`project model ${project.id} failed: ${(error as Error).name}: ${(error as Error).message}`);
    await recordRun({ projectId: project.id, status: "failed", startedAt, finishedAt: new Date().toISOString(), error: message });
    throw error;
  }
}

export type StartOutcome =
  | { status: "started" }
  | { status: "running" }
  | { status: "rate-limited"; retryAfterS: number }
  /** The rate limit couldn't be checked (the store failed). Paid runs fail closed. */
  | { status: "unavailable" };

/**
 * Starts a model run that outlives the request (Next's after(), within the route's maxDuration). Used when a project
 * is added from scouting, and by the agent. Refuses when a run is in progress or the caller is over the limit.
 */
export async function startProjectModel(project: ScoutedProject, rateKey: string): Promise<StartOutcome> {
  if ((await loadModelRun(project.id))?.status === "generating") return { status: "running" };
  const release = claimRun(`model:${project.id}`);
  if (!release) return { status: "running" };
  let limit: Awaited<ReturnType<typeof takeGeneration>>;
  try {
    limit = await takeGeneration(rateKey);
  } catch (error) {
    release();
    console.error(`project model ${project.id}: rate limit check failed, not starting`, (error as Error).message);
    return { status: "unavailable" };
  }
  if (!limit.ok) {
    release();
    await recordRun({
      projectId: project.id,
      status: "failed",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      error: "The model wasn't generated: 5 models were made in the last hour. Generate it from the Model tab later.",
    });
    return { status: "rate-limited", retryAfterS: limit.retryAfterS };
  }
  const work = runProjectModel(project)
    .catch(() => undefined) // recorded as failed
    .finally(release);
  try {
    after(() => work);
  } catch {
    // Outside a request (tests): the promise still runs.
  }
  return { status: "started" };
}
