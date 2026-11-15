import { loadModelInfo } from "@/features/model/load";
import { teaserPath } from "@/features/viewer/camera-paths";
import { ModelViewer } from "@/features/viewer/ModelViewer";

// Read model.json on every request, so a rebuilt model shows up without a redeploy.
export const dynamic = "force-dynamic";

/** TrademarksTool: the interactive 3D model, full screen, and nothing else. */
export default async function Home() {
  const model = await loadModelInfo();

  return (
    <main className="relative h-dvh w-full">
      <ModelViewer model={model} path={teaserPath(model.boundingBox)} loop={false} className="absolute inset-0" />
    </main>
  );
}
