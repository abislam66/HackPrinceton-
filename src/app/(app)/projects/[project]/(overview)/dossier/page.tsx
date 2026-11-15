import { notFound } from "next/navigation";
import { DossierBoard } from "@/components/app/dossier/DossierBoard";
import { loadDossier } from "@/features/dossier/load";
import { loadProject } from "@/features/project/load";
import { PROJECT_SLUG } from "@/features/project/schema";
import { getScoutedProject } from "@/features/scout/projects";
import { replayFrom } from "@/lib/agent/replay-param";

/** The demo project's name, or a project added from scouting's. Null for an unknown project. */
async function projectName(slug: string): Promise<string | null> {
  if (slug === PROJECT_SLUG) return (await loadProject()).name;
  return (await getScoutedProject(slug))?.candidate.name ?? null;
}

/**
 * The project's dossier: what the research agent found in public sources, every fact citing its page. Opens on the
 * latest run (or the committed snapshot) and can research again live. `?replay=1` replays the last recorded run.
 */
export default async function DossierPage({ params, searchParams }: PageProps<"/projects/[project]/dossier">) {
  const [{ project: slug }, query] = await Promise.all([params, searchParams]);
  const [name, stored] = await Promise.all([projectName(slug), loadDossier(slug)]);
  if (!name) notFound();

  return <DossierBoard projectId={slug} projectName={name} initial={stored?.data ?? null} replay={replayFrom(query)} />;
}
