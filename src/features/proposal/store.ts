import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PROJECT_SLUG } from "@/features/project/schema";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { proposalSchema, type Proposal } from "./schema";

/*
 * Proposals live in Supabase when it is configured. The fallback files in ./fallback/ are the
 * last good proposal per client: they keep the demo working without Supabase, and the committed
 * copies keep the deployed demo working (Vercel's filesystem is read-only).
 */

const FALLBACK_DIR = path.join(process.cwd(), "src", "features", "proposal", "fallback");
const CLIENT_ID = /^[a-z0-9-]+$/;

/** Returns the stored proposal for a client: Supabase first, then the fallback file, else null. */
export async function getProposal(clientId: string): Promise<Proposal | null> {
  if (isSupabaseConfigured()) {
    try {
      const stored = await getStoredProposal(clientId);
      if (stored) return stored;
    } catch (error) {
      console.error(`getProposal(${clientId}): Supabase read failed, using fallback file.`, error);
    }
  }
  return getFallbackProposal(clientId);
}

/**
 * Saves a proposal. Upserts to Supabase when configured. Without Supabase, or if the upsert
 * fails, writes the fallback file instead. Throws only if the Supabase write and the file both fail.
 */
export async function saveProposal(proposal: Proposal): Promise<void> {
  const parsed = proposalSchema.parse(proposal);
  if (isSupabaseConfigured()) {
    try {
      await upsertStoredProposal(parsed);
      return;
    } catch (error) {
      if (!(await writeFallbackProposal(parsed))) throw error;
      console.error(`saveProposal(${parsed.clientId}): Supabase write failed, wrote the fallback file.`, error);
      return;
    }
  }
  await writeFallbackProposal(parsed);
}

/** The last good proposal committed or written for this client, or null. */
export async function getFallbackProposal(clientId: string): Promise<Proposal | null> {
  if (!CLIENT_ID.test(clientId)) return null;
  let raw: string;
  try {
    raw = await readFile(fallbackPath(clientId), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const result = proposalSchema.safeParse(JSON.parse(raw));
  if (!result.success) {
    console.error(`Fallback proposal for ${clientId} does not match proposalSchema.`, result.error);
    return null;
  }
  return result.data;
}

/** Writes the fallback file. Returns false instead of throwing on a read-only filesystem. */
async function writeFallbackProposal(proposal: Proposal): Promise<boolean> {
  if (!CLIENT_ID.test(proposal.clientId)) return false;
  try {
    await mkdir(FALLBACK_DIR, { recursive: true });
    await writeFile(fallbackPath(proposal.clientId), `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
    return true;
  } catch (error) {
    console.error(`Could not write fallback proposal for ${proposal.clientId}.`, error);
    return false;
  }
}

function fallbackPath(clientId: string): string {
  return path.join(FALLBACK_DIR, `${clientId}.json`);
}

async function getStoredProposal(clientId: string): Promise<Proposal | null> {
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

async function upsertStoredProposal(proposal: Proposal): Promise<void> {
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
