import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { loadReplay } from "@/features/pipeline-demo/load";
import { PipelineReplay } from "@/features/pipeline-demo/PipelineReplay";
import { loadClients, loadProject } from "@/features/project/load";

// Read the project and client files on every request, so the replay always ends on what is on disk.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Project pipeline" };

export default async function PipelinePage() {
  const [project, clients] = await Promise.all([loadProject(), loadClients()]);
  const replay = loadReplay(clients);

  return (
    <>
      <SiteHeader />
      <PipelineReplay project={project} clients={clients} replay={replay} />
    </>
  );
}
