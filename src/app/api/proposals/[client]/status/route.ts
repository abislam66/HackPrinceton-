import { NextResponse } from "next/server";
import { allowedTransitions, canTransition, statusUpdateSchema } from "@/features/proposal/status";
import { getProposal, saveProposal } from "@/features/proposal/store";
import { PROJECT_SLUG } from "@/features/project/schema";

/**
 * Moves a proposal through review. Body: `{status}`. `?project=<slug>` picks the project
 * (default `demo-project`).
 * 200 with the updated proposal; 400 bad body; 404 no proposal; 409 transition not allowed;
 * 503 when nothing can be written (no Supabase on a read-only filesystem).
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/proposals/[client]/status">) {
  const { client } = await ctx.params;
  const project = new URL(request.url).searchParams.get("project") || PROJECT_SLUG;
  if (!/^[a-z0-9-]+$/.test(project)) return NextResponse.json({ error: `Bad project: ${project}` }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON: {status}" }, { status: 400 });
  }
  const parsed = statusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "status must be one of draft, approved, sent" }, { status: 400 });
  }
  const to = parsed.data.status;

  try {
    const proposal = await getProposal(client, project);
    if (!proposal) return NextResponse.json({ error: `No proposal for client: ${client}` }, { status: 404 });
    if (!canTransition(proposal.status, to)) {
      return NextResponse.json(
        {
          error: `Cannot move a proposal from ${proposal.status} to ${to}`,
          status: proposal.status,
          allowed: allowedTransitions(proposal.status),
        },
        { status: 409 },
      );
    }
    const updated = { ...proposal, status: to };
    if ((await saveProposal(updated)) === "none") {
      return NextResponse.json({ error: "No writable store: configure Supabase" }, { status: 503 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
