import { NextResponse } from "next/server";
import { z } from "zod";
import { sendOutreach } from "@/features/outreach/actions";
import { emailDraftSchema, type EmailDraft } from "@/features/outreach/schema";

export const maxDuration = 60;

/** The operator's edits, plus the address they typed in the send dialog, if any. */
const sendBodySchema = emailDraftSchema.extend({ to: z.string().max(320).optional() });

/**
 * Sends the stored draft through Gmail and returns the `OutreachMessage`: 200 with status `sent`, or 502 with
 * status `failed` and `error`. By default it goes to OUTREACH_DELIVER_TO as a labelled demo copy, never to the
 * stakeholder. With `to` in the body it goes to that one address as written, if it is on OUTREACH_ALLOWLIST.
 * Optional body `{subject, body, to?}`: the operator's edits, which replace the draft before it is sent
 * (the proposal link is kept in the body). An empty body sends the draft as stored.
 * 400 bad body. 403 `to` is not on OUTREACH_ALLOWLIST. 404 no draft. 409 already sent, unless `?resend=1`.
 * 503 Gmail or OUTREACH_DELIVER_TO not set up.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/outreach/[client]/send">) {
  const { client } = await ctx.params;
  const resend = new URL(request.url).searchParams.get("resend") === "1";

  const raw = await request.text();
  let edits: EmailDraft | undefined;
  let to: string | undefined;
  if (raw.trim() && raw.trim() !== "{}") {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "The body must be JSON" }, { status: 400 });
    }
    const parsed = sendBodySchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
    const { to: typed, ...draft } = parsed.data;
    edits = draft;
    to = typed;
  }

  try {
    const result = await sendOutreach(client, { resend, edits, to });
    switch (result.status) {
      case "refused":
        // A malformed address is the caller's mistake (400); a well-formed one that is not allowed is forbidden (403).
        return NextResponse.json({ error: result.reason }, { status: result.why === "not-allowed" ? 403 : 400 });
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
