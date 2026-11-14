import "server-only";
import { PROJECT_SLUG } from "@/features/project/schema";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { TrackingEvent } from "./schema";

export async function recordEvent(event: TrackingEvent): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured. Fill in .env.local.");
  const supabase = await createClient();
  const { error } = await supabase.from("proposal_events").insert({
    project_slug: PROJECT_SLUG,
    client_id: event.clientId,
    type: event.type,
    payload: event.payload,
  });
  if (error) throw new Error(`Could not record event: ${error.message}`);
}
