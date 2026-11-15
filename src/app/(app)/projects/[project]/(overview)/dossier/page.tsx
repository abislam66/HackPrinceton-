import { notFound } from "next/navigation";
import { DossierBoard } from "@/components/app/dossier/DossierBoard";
import { loadDossier } from "@/features/dossier/load";
import { loadProject } from "@/features/project/load";
import { PROJECT_SLUG } from "@/features/project/schema";
import { loadProjectFacts } from "@/features/project-agent/store";
import { getScoutedProject } from "@/features/scout/projects";
import { replayFrom } from "@/lib/agent/replay-param";

/**
 * The building the dossier covers. Projects opened from the project agent's drafts share the demo project's building,
 * so they share its dossier; a project added from scouting has its own. Null for an unknown project.
 */
async function dossierSubject(slug: string): Promise<{ id: string; name: string } | null> {
  if (await loadProjectFacts(slug)) return { id: PROJECT_SLUG, name: (await loadProject()).name };
  const scouted = await getScoutedProject(slug);
  return scouted ? { id: slug, name: scouted.candidate.name } : null;
}

/**
 * The project's dossier: what the research agent found in public sources, every fact citing its page. Opens on the
 * latest run (or the committed snapshot) and can research again live. `?replay=1` replays the last recorded run.
 */
export default async function DossierPage({ params, searchParams }: PageProps<"/projects/[project]/dossier">) {
  const [{ project: slug }, query] = await Promise.all([params, searchParams]);
  const subject = await dossierSubject(slug);
  if (!subject) notFound();
  const stored = await loadDossier(subject.id);

  return (
    <DossierBoard
      projectId={subject.id}
      projectName={subject.name}
      initial={stored?.data ?? null}
      replay={replayFrom(query)}
    />
  );
}
