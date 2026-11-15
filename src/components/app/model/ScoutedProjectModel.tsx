import "server-only";
import { notFound } from "next/navigation";
import { currentViewerPage } from "@/features/building-viewer/viewer-page";
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
  // Pages stored before a stage change (the sky, the ground) are shown on today's scaffold.
  const page = model ? await currentViewerPage(model.html) : null;
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
              html: page?.html ?? model.html,
              stale: page ? !page.current : false,
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
