import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PROJECT_SLUG } from "@/features/project/schema";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { proposalSchema, type Proposal } from "./schema";

/*
 * Where proposals live, in the order they are read:
 * 1. Supabase, when it is configured.
 * 2. A local draft: the last proposal generated or edited on this machine without Supabase. It sits
 *    in the OS temp directory, outside the repo, so it can never be committed by accident.
 * 3. The committed fallback in ./fallback/: the reviewed proposal per client that keeps the demo
 *    working (Vercel ships it). The app only reads it; to change it, edit and commit the file.
 */

const FALLBACK_DIR = path.join(process.cwd(), "src", "features", "proposal", "fallback");
const CLIENT_ID = /^[a-z0-9-]+$/;

/** Local drafts. PROPOSAL_DRAFTS_DIR overrides it (tests use this). */
function draftsDir(): string {
  return process.env.PROPOSAL_DRAFTS_DIR || path.join(os.tmpdir(), "tradesmark-proposals", PROJECT_SLUG);
}

/** Returns the stored proposal for a client: Supabase, then a local draft, then the committed fallback. */
export async function getProposal(clientId: string, projectSlug: string = PROJECT_SLUG): Promise<Proposal | null> {
  if (isSupabaseConfigured()) {
    try {
      const stored = await getStoredProposal(clientId, projectSlug);
      if (stored) return stored;
    } catch (error) {
      console.error(`getProposal(${clientId}): Supabase read failed, using the local copy.`, error);
    }
  }
  return (await readProposalFile(draftPath(clientId), clientId)) ?? getFallbackProposal(clientId);
}

/**
 * Saves a proposal. Upserts to Supabase when configured. Without Supabase, or if the upsert fails,
 * writes a local draft; the committed fallback is never touched. Throws only if both fail.
 * Returns where it was saved; "none" means no Supabase and nowhere writable.
 */
export async function saveProposal(proposal: Proposal): Promise<"supabase" | "file" | "none"> {
  const parsed = proposalSchema.parse(proposal);
  if (isSupabaseConfigured()) {
    try {
      await upsertStoredProposal(parsed);
      return "supabase";
    } catch (error) {
      if (!(await writeDraft(parsed))) throw error;
      console.error(`saveProposal(${parsed.clientId}): Supabase write failed, wrote a local draft.`, error);
      return "file";
    }
  }
  return (await writeDraft(parsed)) ? "file" : "none";
}

/** The reviewed proposal committed for this client, or null. Read-only to the app. */
export async function getFallbackProposal(clientId: string): Promise<Proposal | null> {
  return readProposalFile(path.join(FALLBACK_DIR, `${clientId}.json`), clientId);
}

async function readProposalFile(file: string | null, clientId: string): Promise<Proposal | null> {
  if (!file || !CLIENT_ID.test(clientId)) return null;
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const result = proposalSchema.safeParse(JSON.parse(raw));
  if (!result.success) {
    console.error(`Proposal file for ${clientId} does not match proposalSchema: ${file}`, result.error);
    return null;
  }
  return result.data;
}

/** Writes the local draft (atomically, via a temp file). Returns false instead of throwing when it can't. */
async function writeDraft(proposal: Proposal): Promise<boolean> {
  const file = draftPath(proposal.clientId);
  if (!file) return false;
  try {
    await mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
    await rename(temp, file);
    return true;
  } catch (error) {
    console.error(`Could not write a local draft for ${proposal.clientId}.`, error);
    return false;
  }
}

function draftPath(clientId: string): string | null {
  return CLIENT_ID.test(clientId) ? path.join(draftsDir(), `${clientId}.json`) : null;
}

async function getStoredProposal(clientId: string, projectSlug: string): Promise<Proposal | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proposals")
    .select("client_id, project_slug, status, pitch, shots")
    .eq("project_slug", projectSlug)
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
