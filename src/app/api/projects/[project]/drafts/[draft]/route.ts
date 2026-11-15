import { NextResponse } from "next/server";
import { z } from "zod";
import { draftCard } from "@/features/project-agent/agent";
import { DraftError, resolveDraft } from "@/features/project-agent/drafts";

const bodySchema = z.object({ action: z.enum(["replace", "new-project", "discard"]) });

/**
 * Resolves a pending draft. Body `{action: "replace" | "new-project" | "discard"}`.
 * 200 `{draft: DraftCard}` (with `newProjectId` after new-project); 400 bad body; 404 unknown
 * project or draft; 409 already resolved.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[project]/drafts/[draft]">) {
  const { project, draft } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON: {action}" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "action must be replace, new-project or discard" }, { status: 400 });
  try {
    return NextResponse.json({ draft: draftCard(await resolveDraft(project, draft, parsed.data.action)) });
  } catch (error) {
    if (error instanceof DraftError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(`POST /api/projects/${project}/drafts/${draft} failed`, error);
    return NextResponse.json({ error: "Could not resolve the draft." }, { status: 500 });
  }
}
