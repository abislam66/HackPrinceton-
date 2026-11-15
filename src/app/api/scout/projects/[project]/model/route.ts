import { NextResponse } from "next/server";
import { clientKey, takeGeneration } from "@/features/building-viewer/guard";
import { StepError } from "@/features/building-viewer/generate";
import type { ViewerEvent } from "@/features/building-viewer/schema";
import { loadModelRun, runProjectModel } from "@/features/scout/model";
import { getScoutedProject } from "@/features/scout/projects";
import { claimRun } from "@/lib/agent/run";

// One Opus call with web search, which can run for minutes; the generator stops itself in time.
export const maxDuration = 300;

/**
 * Generates the 3D model for a project added from scouting, from its address, its scout facts and its dossier, and
 * stores it on the project: the viewer page (Model tab) and the GLB (Shots tab, proposal). Streams the generator's
 * NDJSON (`ViewerEvent` lines, ending with `result` or `error`). Shares the generator's limit of 5 runs an hour per
 * caller. 404 unknown project. 409 a run is already going (it starts by itself when the project is added). 429 over
 * the limit.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/scout/projects/[project]/model">) {
  const { project: id } = await ctx.params;
  const project = await getScoutedProject(id);
  if (!project) return NextResponse.json({ error: `Unknown project: ${id}` }, { status: 404 });

  const busy = { error: "The model is already being generated. It shows here when it's done." };
  if ((await loadModelRun(project.id))?.status === "generating") return NextResponse.json(busy, { status: 409 });
  const release = claimRun(`model:${project.id}`);
  if (!release) return NextResponse.json(busy, { status: 409 });

  let limit: Awaited<ReturnType<typeof takeGeneration>>;
  try {
    limit = await takeGeneration(clientKey(request.headers));
  } catch (error) {
    // Never keep the lock on a failed check, or this project is stuck on 409 until the instance restarts.
    release();
    console.error(`project model ${project.id}: rate limit check failed`, (error as Error).message);
    return NextResponse.json({ error: "The model can't be started right now. Try again in a minute." }, { status: 503 });
  }
  if (!limit.ok) {
    release();
    return NextResponse.json(
      { error: "That's 5 models in the last hour. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The page may close mid-run. The run carries on and stores the model, so a send to a closed stream is dropped.
      const emit = (event: ViewerEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // Client gone.
        }
      };
      try {
        const { result } = await runProjectModel(project, emit);
        emit(result);
      } catch (error) {
        const step = error instanceof StepError ? error.step : "model";
        const message = error instanceof StepError ? error.message : "Generating the model failed. Try again.";
        emit({ type: "error", error: message, step });
      } finally {
        release();
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
