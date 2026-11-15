import "server-only";
import { notFound } from "next/navigation";
import { loadDossier } from "@/features/dossier/load";
import { loadModelRun, loadProjectModel } from "@/features/scout/model";
import { getScoutedProject } from "@/features/scout/projects";
import { ModelBoard, type BackgroundRun } from "./ModelBoard";

/** The Model tab of a project added from scouting: its stored model, a run in progress, or the button that starts one. */
export async function ScoutedProjectModel({ slug }: { slug: string }) {
  const [project, model, dossier, run] = await Promise.all([
    getScoutedProject(slug),
    loadProjectModel(slug),
    loadDossier(slug),
    loadModelRun(slug),
  ]);
  if (!project) notFound();
  const background: BackgroundRun =
    run?.status === "generating"
      ? { status: "generating", startedAt: run.startedAt }
      : run?.status === "failed" && run.error
        ? { status: "failed", error: run.error }
        : null;
  return (
    <ModelBoard
      // A new model remounts the board with fresh state. Run status changes arrive as props, so a refresh during the
      // board's own run never cuts its stream.
      key={model?.generatedAt ?? "none"}
      projectId={project.id}
      background={background}
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
