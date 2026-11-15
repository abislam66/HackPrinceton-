import { NextResponse } from "next/server";
import { z } from "zod";
import { applyScenario, MAX_CHANGE_CHARS } from "@/features/proposal/scenario";

export const maxDuration = 60;

const bodySchema = z.object({ change: z.string().trim().min(5).max(MAX_CHANGE_CHARS) });

/**
 * Re-pitches one client from a described change, e.g. `{"change": "Temple now wants footage for
 * student recruitment"}`. 200 `{scenario, client, proposal}` with the new draft saved; 400 bad
 * body; 404 unknown client; 503 no API key; 502 generation failed (nothing saved).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/proposals/[client]/scenario">) {
  const { client } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON: {change}" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: `change must be ${5}-${MAX_CHANGE_CHARS} characters` }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Generation isn't connected: ANTHROPIC_API_KEY is not set." }, { status: 503 });
  }
  try {
    const result = await applyScenario(client, parsed.data.change);
    if (!result) return NextResponse.json({ error: `Unknown client: ${client}` }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    console.error(`POST /api/proposals/${client}/scenario failed`, error);
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
