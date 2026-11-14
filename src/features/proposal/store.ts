import "server-only";
import { PROJECT_SLUG } from "@/features/project/schema";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { proposalSchema, type Proposal } from "./schema";

/** Returns the stored proposal for a client, or null if none has been generated. */
export async function getProposal(clientId: string): Promise<Proposal | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proposals")
    .select("client_id, project_slug, status, pitch, shots")
    .eq("project_slug", PROJECT_SLUG)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw new Error(`Could not load proposal: ${error.message}`);
  if (!data) return null;
  return proposalSchema.parse({
    clientId: data.client_id,
    projectSlug: data.project_slug,
    status: data.status,
    pitch: data.pitch,
    shots: data.shots,
  });
}

export async function saveProposal(proposal: Proposal): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured. Fill in .env.local.");
  const supabase = await createClient();
  const { error } = await supabase.from("proposals").upsert({
    client_id: proposal.clientId,
    project_slug: proposal.projectSlug,
    status: proposal.status,
    pitch: proposal.pitch,
    shots: proposal.shots,
  });
  if (error) throw new Error(`Could not save proposal: ${error.message}`);
}
