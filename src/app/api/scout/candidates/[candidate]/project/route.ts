import { NextResponse } from "next/server";
import { addScoutedProject } from "@/features/scout/projects";

/**
 * Adds a scouted building to Projects. The project id is the candidate id. Returns `{project}`: 201 when added,
 * 200 when it was already a project. 404 when the latest scout run has no such candidate.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/scout/candidates/[candidate]/project">) {
  const { candidate } = await ctx.params;
  try {
    const result = await addScoutedProject(candidate);
    switch (result.status) {
      case "unknown-candidate":
        return NextResponse.json({ error: `No scouted project: ${candidate}` }, { status: 404 });
      case "reserved":
        return NextResponse.json({ error: "That id is the demo project's." }, { status: 400 });
      case "added":
        return NextResponse.json({ project: result.project }, { status: 201 });
      case "exists":
        return NextResponse.json({ project: result.project });
    }
  } catch (error) {
    console.error(`POST /api/scout/candidates/${candidate}/project failed.`, error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
