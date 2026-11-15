import { NextResponse } from "next/server";
import { z } from "zod";
import { sendOutreach } from "@/features/outreach/actions";
import { emailDraftSchema } from "@/features/outreach/schema";

export const maxDuration = 60;

/**
 * Sends the stored draft through Gmail to OUTREACH_DELIVER_TO (never to the stakeholder) and
 * returns the `OutreachMessage`: 200 with status `sent`, or 502 with status `failed` and `error`.
 * Optional body `{subject, body}`: the operator's edits, which replace the draft before it is sent
 * (the proposal link is kept in the body). An empty body sends the draft as stored.
 * 400 bad body. 404 no draft. 409 already sent, unless `?resend=1`. 503 Gmail or
 * OUTREACH_DELIVER_TO not set up.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/outreach/[client]/send">) {
  const { client } = await ctx.params;
  const resend = new URL(request.url).searchParams.get("resend") === "1";

  const raw = await request.text();
  let edits: z.infer<typeof emailDraftSchema> | undefined;
  if (raw.trim() && raw.trim() !== "{}") {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "The body must be JSON" }, { status: 400 });
    }
    const parsed = emailDraftSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
    edits = parsed.data;
  }

  try {
    const result = await sendOutreach(client, { resend, edits });
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
