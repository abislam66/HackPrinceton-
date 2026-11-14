import { NextResponse } from "next/server";
import { generateProposal } from "@/features/proposal/generate";

/** Generates and stores a draft proposal for one client. */
export async function POST(_request: Request, ctx: RouteContext<"/api/proposals/[client]/generate">) {
  const { client } = await ctx.params;
  try {
    const proposal = await generateProposal(client);
    if (!proposal) return NextResponse.json({ error: `Unknown client: ${client}` }, { status: 404 });
    return NextResponse.json(proposal);
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json({ error: message }, { status: message.includes("not implemented") ? 501 : 500 });
  }
}
