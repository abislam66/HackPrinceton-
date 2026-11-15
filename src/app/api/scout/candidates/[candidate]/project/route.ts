import { NextResponse } from "next/server";
import { clientKey } from "@/features/building-viewer/guard";
import { startProjectModel } from "@/features/scout/model";
import { addScoutedProject } from "@/features/scout/projects";

// Adding a project starts its 3D model, which keeps running after the response (after()) for up to a few minutes.
export const maxDuration = 300;

/**
 * Adds a scouted building to Projects. The project id is the candidate id. Returns `{project, model}`: 201 when added,
 * 200 when it was already a project. 404 when the latest scout run has no such candidate.
 *
 * A newly added project starts generating its 3D model straight away (`model`: "started", "running" or
 * "rate-limited"), so its Shots tab shows the building instead of a gray box. An existing project's model is left alone.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/scout/candidates/[candidate]/project">) {
  const { candidate } = await ctx.params;
  try {
    const result = await addScoutedProject(candidate);
    switch (result.status) {
      case "unknown-candidate":
        return NextResponse.json({ error: `No scouted project: ${candidate}` }, { status: 404 });
      case "reserved":
        return NextResponse.json({ error: "That id is the demo project's." }, { status: 400 });
      case "added": {
        const model = await startProjectModel(result.project, clientKey(request.headers)).catch((error) => {
          console.error(`Starting the model for ${candidate} failed.`, (error as Error).message);
          return { status: "not started" as const };
        });
        return NextResponse.json({ project: result.project, model: model.status }, { status: 201 });
      }
      case "exists":
        return NextResponse.json({ project: result.project });
    }
  } catch (error) {
    console.error(`POST /api/scout/candidates/${candidate}/project failed.`, error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
