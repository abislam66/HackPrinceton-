import { notFound } from "next/navigation";
import { loadModelInfo } from "@/features/model/load";
import { loadClient } from "@/features/project/load";
import { teaserPath } from "@/features/viewer/camera-paths";
import { ModelViewer } from "@/features/viewer/ModelViewer";

/** The model for one client. Same view as the home page: the pitch text is not shown. */
export default async function ProposalPage({ params }: PageProps<"/proposals/[client]">) {
  const { client: clientId } = await params;
  if (!(await loadClient(clientId))) notFound();

  const model = await loadModelInfo();

  return (
    <main className="relative h-dvh w-full">
      <ModelViewer model={model} path={teaserPath(model.boundingBox)} loop={false} className="absolute inset-0" />
    </main>
  );
}
