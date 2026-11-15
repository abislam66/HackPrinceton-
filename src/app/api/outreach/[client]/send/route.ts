import { NextResponse } from "next/server";
import { sendOutreach } from "@/features/outreach/actions";

export const maxDuration = 60;

/**
 * Sends the stored draft through Gmail to OUTREACH_DELIVER_TO (never to the stakeholder) and
 * returns the `OutreachMessage`: 200 with status `sent`, or 502 with status `failed` and `error`.
 * 404 no draft. 409 already sent, unless `?resend=1`. 503 Gmail or OUTREACH_DELIVER_TO not set up.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/outreach/[client]/send">) {
  const { client } = await ctx.params;
  const resend = new URL(request.url).searchParams.get("resend") === "1";
  try {
    const result = await sendOutreach(client, { resend });
    switch (result.status) {
      case "no-draft":
        return NextResponse.json(
          { error: `No draft for ${client}. POST /api/outreach/${client}/draft first.` },
          { status: 404 },
        );
      case "already-sent":
        return NextResponse.json(
          { error: "Already sent. Pass ?resend=1 to send it again.", message: result.message },
          { status: 409 },
        );
      case "not-configured":
        return NextResponse.json({ error: result.reason }, { status: 503 });
      case "failed":
        return NextResponse.json(result.message, { status: 502 });
      case "ok":
        return NextResponse.json(result.message);
    }
  } catch (error) {
    console.error(`POST /api/outreach/${client}/send failed.`, error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
