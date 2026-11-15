import "server-only";
import { loadStakeholderModel } from "@/features/workspace/model";
import { generatePitch } from "@/features/pitch/generate";
import { loadClient, loadProject } from "@/features/project/load";
import { generateShots } from "@/features/shots/generate";
import type { Proposal } from "./schema";
import { getProposal, saveProposal } from "./store";

/** Whole-pipeline budget. Past this the demo shows the cached proposal instead of stalling. */
const GENERATION_BUDGET_MS = 25_000;

/** live: generated just now. cache: generation failed or ran long, so this is the last good one. */
export type ProposalSource = "live" | "cache";

export type GenerateResult =
  | { status: "ok"; proposal: Proposal; source: ProposalSource; error?: string }
  | { status: "unknown-client" };

/**
 * Runs the pipeline for one client: shots, then pitch (it captions the shots), then save as a
 * draft for review. On any failure or timeout, returns the last good proposal for the client.
 * Throws only when generation fails and there is nothing cached.
 */
export async function generateProposal(clientId: string): Promise<GenerateResult> {
  const client = await loadClient(clientId);
  if (!client) return { status: "unknown-client" };

  const live = (async () => {
    const [project, model] = await Promise.all([loadProject(), loadStakeholderModel(clientId)]);
    const shots = await generateShots({ project, client, model });
    const pitch = await generatePitch({ project, client, shots });
    const proposal: Proposal = { clientId, projectSlug: project.slug, status: "draft", pitch, shots };
    await saveProposal(proposal);
    return proposal;
  })();

  try {
    const proposal = await withTimeout(live, GENERATION_BUDGET_MS);
    return { status: "ok", proposal, source: "live" };
  } catch (error) {
    // A run that times out keeps going and still saves if it finishes; don't leave it unhandled.
    live.catch(() => {});
    const reason = (error as Error).message;
    console.error(`generateProposal(${clientId}): live generation failed, trying cache. ${reason}`);
    const cached = await getProposal(clientId);
    if (!cached) throw error;
    return { status: "ok", proposal: cached, source: "cache", error: reason };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Generation took longer than ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
