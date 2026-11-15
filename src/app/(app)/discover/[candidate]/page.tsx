import { notFound } from "next/navigation";
import { DossierBoard } from "@/components/app/dossier/DossierBoard";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatStrip } from "@/components/ui/StatStrip";
import { loadDossier } from "@/features/dossier/load";
import { scoutFacts, scoutPlace } from "@/features/scout/facts";
import { loadScoutResult } from "@/features/scout/load";
import { getScoutedProject } from "@/features/scout/projects";
import { replayFrom } from "@/lib/agent/replay-param";
import { AddToProjectsButton } from "./_components/AddToProjectsButton";

/**
 * A project the scout found: what scouting knows, then its dossier. The dossier is researched live from here, which
 * is the demo's live step for a real building (Morgan Hall North's dossier is a saved run). "Add to projects" makes
 * it a project, where its model is generated.
 */
export default async function ScoutedProjectPage({ params, searchParams }: PageProps<"/discover/[candidate]">) {
  const [{ candidate: id }, query] = await Promise.all([params, searchParams]);
  const [scout, added] = await Promise.all([loadScoutResult(), getScoutedProject(id)]);
  // A project added from an older scout run keeps its own copy, so its page still opens.
  const candidate = scout?.data.candidates.find((c) => c.id === id) ?? added?.candidate;
  if (!candidate) notFound();

  const dossier = await loadDossier(candidate.id);

  return (
    <div className="@container flex flex-col p-8">
      <PageHeader
        breadcrumbs={[{ label: "Discover", href: "/discover" }, { label: candidate.name }]}
        title={candidate.name}
        description={`${scoutPlace(candidate)} · ${candidate.buildingType}`}
        actions={
          added ? (
            <Button variant="primary" href={`/projects/${added.id}`}>
              Open project
            </Button>
          ) : (
            <AddToProjectsButton candidateId={candidate.id} />
          )
        }
      />

      <div className="flex flex-col gap-6">
        <Panel flush>
          <StatStrip label="What the scout found" items={scoutFacts(candidate)} />
        </Panel>

        <DossierBoard
          projectId={candidate.id}
          projectName={candidate.name}
          initial={dossier?.data ?? null}
          replay={replayFrom(query)}
          emptyAction="secondary"
        />
      </div>
    </div>
  );
}
