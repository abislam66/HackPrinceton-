import { NextResponse } from "next/server";
import { recordEvent } from "@/features/tracking/record";
import { trackingEventSchema } from "@/features/tracking/schema";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/** Records an open, watch or click event from a proposal page. */
export async function POST(request: Request) {
  const parsed = trackingEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  try {
    await recordEvent(parsed.data);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
