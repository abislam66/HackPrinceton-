import { NextResponse } from "next/server";
import { clientKey, takeGeneration } from "@/features/building-viewer/guard";
import { generateViewer, StepError } from "@/features/building-viewer/generate";
import type { ViewerEvent } from "@/features/building-viewer/schema";
import { loadDossier } from "@/features/dossier/load";
import { saveProjectModel, viewerInputFor } from "@/features/scout/model";
import { getScoutedProject } from "@/features/scout/projects";

// One Opus call with web search, which can run for minutes; the generator stops itself at 270 s.
export const maxDuration = 300;

/**
 * Generates the 3D model (a building viewer) for a project added from scouting, from its address, its scout facts
 * and its dossier, and stores it on the project. Streams the viewer generator's NDJSON (`ViewerEvent` lines, ending
 * with `result` or `error`). Shares the generator's limit of 5 runs an hour per caller.
 * 404 unknown project. 429 over the limit.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/scout/projects/[project]/model">) {
  const { project: id } = await ctx.params;
  const project = await getScoutedProject(id);
  if (!project) return NextResponse.json({ error: `Unknown project: ${id}` }, { status: 404 });

  const limit = takeGeneration(clientKey(request.headers));
  if (!limit.ok) {
    return NextResponse.json(
      { error: "That's 5 models in the last hour. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } },
    );
  }

  const dossier = await loadDossier(project.id);
  const input = viewerInputFor(project, dossier?.data ?? null);

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
        const result = await generateViewer(input, null, emit);
        await saveProjectModel({
          projectId: project.id,
          html: result.html,
          reply: result.reply,
          geocodeStatus: result.geocode_status,
          contextStatus: result.context_status,
          drift: result.drift,
          generatedAt: new Date().toISOString(),
        });
        emit(result);
      } catch (error) {
        const step = error instanceof StepError ? error.step : "model";
        const message = error instanceof StepError ? error.message : "Generating the model failed. Try again.";
        if (!(error instanceof StepError)) console.error(`project model ${project.id} failed: ${(error as Error).name}`);
        emit({ type: "error", error: message, step });
      } finally {
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
