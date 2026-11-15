import { notFound } from "next/navigation";
import { BuiltProjectModel } from "@/components/app/model/BuiltProjectModel";
import { ScoutedProjectModel } from "@/components/app/model/ScoutedProjectModel";
import { projectBuilding } from "@/features/project-agent/store";

/**
 * The Model tab: a project added from scouting (or opened from one) shows its building's generated model; the demo
 * project (or one opened from it) shows the model builder's.
 */
export default async function ProjectModelPage({ params }: PageProps<"/projects/[project]/model">) {
  const { project: slug } = await params;
  const building = await projectBuilding(slug);
  if (building?.kind === "demo") return <BuiltProjectModel />;
  if (building?.kind !== "scouted") notFound();
  return <ScoutedProjectModel slug={building.id} />;
}
