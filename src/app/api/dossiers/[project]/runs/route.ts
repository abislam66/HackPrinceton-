import { runDossier } from "@/features/dossier/dossier";
import { loadDossier } from "@/features/dossier/load";
import type { Dossier } from "@/features/dossier/schema";
import { resolveTarget } from "@/features/dossier/target";
import { replayOptions, replayRun, streamRun } from "@/lib/agent/run";
import { writeRecord } from "@/lib/store/json-store";

/**
 * Streams a live dossier run as NDJSON (RunEvent lines, see src/lib/agent/schema.ts).
 * `[project]` is "demo-project" or a scout candidate id. `?replay=1&speed=2` re-streams the last
 * recorded run instead. 404 for an unknown project, 409 while a run for it is in progress.
 */
export const maxDuration = 300;

const PROJECT_ID = /^[a-z0-9-]+$/;

export async function POST(request: Request, ctx: RouteContext<"/api/dossiers/[project]/runs">) {
  const { project } = await ctx.params;
  if (!PROJECT_ID.test(project)) return Response.json({ error: "Bad project id" }, { status: 400 });

  const target = await resolveTarget(project);
  if (!target) return Response.json({ error: `Unknown project: ${project}` }, { status: 404 });

  const recording = `dossier-${project}.ndjson`;
  const { replay, speed } = replayOptions(request);
  if (replay) return replayRun(recording, [`src/features/dossier/recordings/${recording}`], speed);

  return streamRun<Dossier>({
    key: `dossier:${project}`,
    deadlineMs: 180_000,
    run: (run) => runDossier(target, run),
    save: (data) => writeRecord("dossiers", project, data),
    fallback: () => loadDossier(project),
    recordAs: recording,
  });
}
