import "server-only";
import { loadModelInfo } from "@/features/model/load";
import { generatePitch } from "@/features/pitch/generate";
import { loadClient, loadProject } from "@/features/project/load";
import { generateShots } from "@/features/shots/generate";
import type { Proposal } from "./schema";
import { saveProposal } from "./store";

/** Runs the pipeline for one client: shots, then pitch, then save as a draft for review. */
export async function generateProposal(clientId: string): Promise<Proposal | null> {
  const client = await loadClient(clientId);
  if (!client) return null;
  const [project, model] = await Promise.all([loadProject(), loadModelInfo()]);

  const shots = await generateShots({ project, client, model });
  const pitch = await generatePitch({ project, client, shots });

  const proposal: Proposal = { clientId, projectSlug: project.slug, status: "draft", pitch, shots };
  await saveProposal(proposal);
  return proposal;
}
