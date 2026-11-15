import { notFound } from "next/navigation";
import { ScoutedProjectModel } from "@/components/app/model/ScoutedProjectModel";
import { projectBuilding } from "@/features/project-agent/store";

/** The Model tab of a project added from scouting (or opened from one): its building's generated viewer. */
export default async function ProjectModelPage({ params }: PageProps<"/projects/[project]/model">) {
  const { project: slug } = await params;
  const building = await projectBuilding(slug);
  if (building?.kind !== "scouted") notFound();
  return <ScoutedProjectModel slug={building.id} />;
}
