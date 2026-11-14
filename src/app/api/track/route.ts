import { NextResponse } from "next/server";
import { listEvents, recordEvent } from "@/features/tracking/record";
import { trackingEventSchema } from "@/features/tracking/schema";

export const dynamic = "force-dynamic";

/** Records an open, watch or click event from a proposal page. Stored in Supabase, or in memory without it. */
export async function POST(request: Request) {
  const parsed = trackingEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    await recordEvent(parsed.data);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** The latest tracking events, newest first. */
export async function GET() {
  return NextResponse.json({ events: await listEvents(200) });
}
