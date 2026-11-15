import { NextResponse } from "next/server";
import { draftOutreach } from "@/features/outreach/actions";

export const maxDuration = 60;

/**
 * Drafts (or re-drafts) the outreach email for one stakeholder and returns the stored
 * `OutreachMessage` (status `draft`). Header `x-draft-source`: `live` when the model wrote it,
 * `template` when it fell back to the deterministic template.
 * 404 unknown client. 409 already sent, unless `?force=1`.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/outreach/[client]/draft">) {
  const { client } = await ctx.params;
  const force = new URL(request.url).searchParams.get("force") === "1";
  try {
    const result = await draftOutreach(client, { force });
    if (result.status === "unknown-client") {
      return NextResponse.json({ error: `Unknown client: ${client}` }, { status: 404 });
    }
    if (result.status === "already-sent") {
      return NextResponse.json(
        { error: "Already sent. Re-drafting replaces it; pass ?force=1 to do that.", message: result.message },
        { status: 409 },
      );
    }
    return NextResponse.json(result.message, { headers: { "x-draft-source": result.source } });
  } catch (error) {
    console.error(`POST /api/outreach/${client}/draft failed.`, error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
