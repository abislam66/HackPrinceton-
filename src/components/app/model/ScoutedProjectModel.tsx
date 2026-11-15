import "server-only";
import { notFound } from "next/navigation";
import { loadDossier } from "@/features/dossier/load";
import { loadProjectModel } from "@/features/scout/model";
import { getScoutedProject } from "@/features/scout/projects";
import { ModelBoard } from "./ModelBoard";

/** The Model tab of a project added from scouting: its stored model, or the button that generates one. */
export async function ScoutedProjectModel({ slug }: { slug: string }) {
  const [project, model, dossier] = await Promise.all([getScoutedProject(slug), loadProjectModel(slug), loadDossier(slug)]);
  if (!project) notFound();
  return (
    <ModelBoard
      projectId={project.id}
      hasDossier={dossier !== null}
      initial={
        model
          ? {
              html: model.html,
              reply: model.reply,
              geocodeStatus: model.geocodeStatus,
              contextStatus: model.contextStatus,
              drift: model.drift,
              generatedAt: model.generatedAt,
            }
          : null
      }
    />
  );
}
