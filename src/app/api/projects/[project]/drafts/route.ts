import { NextResponse } from "next/server";
import { draftCard } from "@/features/project-agent/agent";
import { listDrafts, loadProjectFacts } from "@/features/project-agent/store";

/** The project's drafts, newest first: `{drafts: DraftCard[]}`. 404 for an unknown project. */
export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[project]/drafts">) {
  const { project } = await ctx.params;
  if (!(await loadProjectFacts(project))) return NextResponse.json({ error: `Unknown project: ${project}` }, { status: 404 });
  return NextResponse.json({ drafts: (await listDrafts(project)).map(draftCard) });
}
