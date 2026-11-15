import { NextResponse } from "next/server";
import { generateProposal } from "@/features/proposal/generate";
import { PROJECT_SLUG } from "@/features/project/schema";

/**
 * Generates and stores a draft proposal for one client. `?project=<slug>` picks the project
 * (default `demo-project`), so stakeholders the project agent changed, and those of projects
 * opened from drafts, are built from their current brief.
 * Header `x-proposal-source`: `live` when generated now, `cache` when generation failed or ran
 * past its budget and the last good proposal was returned instead.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/proposals/[client]/generate">) {
  const { client } = await ctx.params;
  const project = new URL(request.url).searchParams.get("project") || PROJECT_SLUG;
  if (!/^[a-z0-9-]+$/.test(project)) return NextResponse.json({ error: `Bad project: ${project}` }, { status: 400 });
  try {
    const result = await generateProposal(client, project);
    if (result.status === "unknown-client") {
      return NextResponse.json({ error: `Unknown client ${client} on project ${project}` }, { status: 404 });
    }
    return NextResponse.json(result.proposal, { headers: { "x-proposal-source": result.source } });
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json({ error: message }, { status: message.includes("not implemented") ? 501 : 500 });
  }
}
