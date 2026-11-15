import { NextResponse } from "next/server";
import { clientKey } from "@/features/building-viewer/guard";
import { loadGeneratedMeta } from "@/features/model/generated";
import { projectBuilding } from "@/features/project-agent/store";
import { PROJECT_SLUG } from "@/features/project/schema";
import { loadModelRun, startProjectModel } from "@/features/scout/model";
import { getScoutedProject } from "@/features/scout/projects";

// POST can start a model run that keeps going after the response.
export const maxDuration = 300;

/** "demo": the project is built on the demo building, whose model comes from the model builder. */
type Status = { status: "ready" | "generating" | "failed" | "none" | "demo"; version?: number; error?: string };

/** The generated building a project uses: its own, else the scouted building it is based on. */
async function status(projectSlug: string): Promise<{ body: Status; buildingId: string | null }> {
  const own = await loadGeneratedMeta(projectSlug);
  const building = await projectBuilding(projectSlug);
  if (!own && building?.kind === "demo") return { body: { status: "demo" }, buildingId: null };
  const buildingId = building?.kind === "scouted" ? building.id : null;
  const run = buildingId ? await loadModelRun(buildingId) : null;
  if (run?.status === "generating") return { body: { status: "generating" }, buildingId };
  const meta = own ?? (buildingId ? await loadGeneratedMeta(buildingId) : null);
  if (meta) return { body: { status: "ready", version: meta.version }, buildingId };
  if (run?.status === "failed") return { body: { status: "failed", error: run.error }, buildingId };
  return { body: { status: "none" }, buildingId };
}

/**
 * GET ?project=<slug>: whether the project's generated 3D model is ready, generating, failed or missing. The demo
 * project uses the model builder and answers 400. The proposal build waits on this before it makes shots, so shots fit
 * the real building rather than the gray box.
 */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("project") ?? "";
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug) || slug === PROJECT_SLUG) {
    return NextResponse.json({ error: "Give a project other than the demo." }, { status: 400 });
  }
  return NextResponse.json((await status(slug)).body, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST ?project=<slug>: starts generating the model when the project has none (a project added before models were
 * made automatically). A failed or finished model is left alone, unless `regenerate=1` (the agent's
 * generate_project_model, which calls this so the run gets its own request and time limit). Runs in progress are
 * never doubled.
 */
export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  const slug = params.get("project") ?? "";
  const regenerate = params.get("regenerate") === "1";
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug) || slug === PROJECT_SLUG) {
    return NextResponse.json({ error: "Give a project other than the demo." }, { status: 400 });
  }
  const { body, buildingId } = await status(slug);
  const startable = body.status === "none" || (regenerate && (body.status === "ready" || body.status === "failed"));
  if (!startable || !buildingId) return NextResponse.json(body);
  const project = await getScoutedProject(buildingId);
  if (!project) return NextResponse.json(body);
  const started = await startProjectModel(project, clientKey(request.headers));
  if (started.status === "rate-limited") {
    return NextResponse.json({ status: "failed", error: "5 models were made in the last hour. Try again later." } satisfies Status, { status: 429 });
  }
  if (started.status === "unavailable") {
    return NextResponse.json({ status: "failed", error: "The model can't be started right now. Try again in a minute." } satisfies Status, { status: 503 });
  }
  return NextResponse.json({ status: "generating" } satisfies Status, { status: 202 });
}
