import "server-only";
import { Panel } from "@/components/ui/Panel";
import { loadModelInfo } from "@/features/model/load";
import { teaserPath } from "@/features/viewer/camera-paths";
import { ModelViewer } from "@/features/viewer/ModelViewer";

/**
 * The Model tab of the demo project (or a project opened from one): the model builder's GLB, in the same house look a
 * generated building gets. Built from the project's files, so there is nothing to generate here.
 */
export async function BuiltProjectModel() {
  const model = await loadModelInfo();
  return (
    <div className="flex flex-col gap-6">
      <Panel title="Model" flush>
        <div className="relative h-[560px]">
          <ModelViewer model={model} path={teaserPath(model.boundingBox)} loop={false} className="absolute inset-0" />
        </div>
        <p className="border-t border-divider px-5 py-3 text-[13px] leading-5 text-muted">
          {model.url
            ? "Built by the model builder from the project's files: its footprint and photos, with the neighbouring buildings and streets from OpenStreetMap."
            : "The model builder hasn't built this project's model yet, so a gray box stands in."}
        </p>
      </Panel>
    </div>
  );
}
