import { NextResponse } from "next/server";
import { generateProposal } from "@/features/proposal/generate";

/**
 * Generates and stores a draft proposal for one client.
 * Header `x-proposal-source`: `live` when generated now, `cache` when generation failed or ran
 * past its budget and the last good proposal was returned instead.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/proposals/[client]/generate">) {
  const { client } = await ctx.params;
  try {
    const result = await generateProposal(client);
    if (result.status === "unknown-client") {
      return NextResponse.json({ error: `Unknown client: ${client}` }, { status: 404 });
    }
    return NextResponse.json(result.proposal, { headers: { "x-proposal-source": result.source } });
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json({ error: message }, { status: message.includes("not implemented") ? 501 : 500 });
  }
}
