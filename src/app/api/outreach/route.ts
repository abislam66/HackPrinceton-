import { NextResponse } from "next/server";
import { getOutreachOverview } from "@/features/outreach/actions";

/**
 * The outreach overview: Gmail status, every message with its replies, and when replies were last
 * pulled. Syncs replies from Gmail first (at most every 30 s) when Gmail is configured.
 */
export async function GET() {
  try {
    return NextResponse.json(await getOutreachOverview());
  } catch (error) {
    console.error("GET /api/outreach failed.", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
