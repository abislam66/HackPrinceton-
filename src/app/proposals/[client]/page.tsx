import { notFound } from "next/navigation";
import { loadModelInfo } from "@/features/model/load";
import { loadProjectFacts } from "@/features/project-agent/store";
import { getProposal } from "@/features/proposal/store";
import { loadShotObstacles } from "@/features/shots/generate";
import { ProposalTracker } from "@/features/tracking/ProposalTracker";
import { findStakeholder } from "@/features/workspace/status";
import { ProposalBrief } from "./_components/ProposalBrief";
import { buildProposalData } from "./_components/proposal-data";

/**
 * The client's proposal page: the opening flight, the pitch, the shot plan, and Book a call. Opens, watch time and
 * the Book a call click are tracked, except on internal previews (`?preview=1`).
 */
export default async function ProposalPage({ params, searchParams }: PageProps<"/proposals/[client]">) {
  const { client: clientId } = await params;
  // Internal previews (?preview=1) must not count as client activity.
  const isPreview = (await searchParams).preview === "1";

  // The URL carries only the client; its project is the one that holds this stakeholder id.
  const found = await findStakeholder(clientId);
  if (!found) notFound();
  const { client, projectSlug } = found;

  const [project, model, proposal] = await Promise.all([
    loadProjectFacts(projectSlug),
    loadModelInfo(),
    getProposal(clientId, projectSlug),
  ]);
  if (!project) notFound();
  const obstacles = await loadShotObstacles(model.boundingBox);

  const data = buildProposalData({ client, project, model, proposal, obstacles });
  return (
    <>
      {isPreview ? null : <ProposalTracker clientId={client.id} />}
      <ProposalBrief data={data} track={!isPreview} />
    </>
  );
}
