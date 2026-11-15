import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadGeneratedMeta } from "@/features/model/generated";
import { loadModelInfo } from "@/features/model/load";
import { PLACEHOLDER_BOUNDING_BOX, buildingSides, modelMetadataSchema, type ModelInfo, type ModelMetadata } from "@/features/model/schema";
import { PROJECT_SLUG } from "@/features/project/schema";

const CLIENT_ID = /^[a-z0-9-]+$/;

/**
 * The stakeholder's own 3D model (a product decision: each stakeholder gets one).
 * Reads public/models/<project>/<clientId>/model.json. Until the builder has written one for this
 * stakeholder, falls back to the single project model (or its gray-box stand-in).
 *
 * The models are of the demo project's building. A project other than the demo uses the model the building viewer
 * generated for it, when one has been saved: the project's own, or its building's (a project added from scouting, or
 * opened from one). A stakeholder of a scouted project with no generated model yet gets the gray-box stand-in, so its
 * shots never frame Morgan Hall North.
 */
function generatedInfo(slug: string, meta: ModelMetadata): ModelInfo {
  return {
    url: `/api/models/${slug}/glb?v=${meta.version}`,
    boundingBox: meta.boundingBox,
    knownSides: meta.knownSides,
    generated: true,
  };
}

export async function loadStakeholderModel(clientId: string, projectSlug: string = PROJECT_SLUG): Promise<ModelInfo> {
  if (projectSlug !== PROJECT_SLUG) {
    const own = await loadGeneratedMeta(projectSlug);
    if (own) return generatedInfo(projectSlug, own);
    // Imported here: the store imports the proposal scenario, which imports this module.
    const { projectBuilding } = await import("@/features/project-agent/store");
    const building = await projectBuilding(projectSlug);
    if (building?.kind === "scouted") {
      const generated = building.id === projectSlug ? null : await loadGeneratedMeta(building.id);
      if (generated) return generatedInfo(building.id, generated);
      return { url: null, boundingBox: PLACEHOLDER_BOUNDING_BOX, knownSides: [...buildingSides] };
    }
  }
  if (!CLIENT_ID.test(clientId)) return loadModelInfo();
  const file = path.join(process.cwd(), "public", "models", PROJECT_SLUG, clientId, "model.json");
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return loadModelInfo();
  }
  const meta = modelMetadataSchema.parse(JSON.parse(raw));
  return {
    url: `/models/${PROJECT_SLUG}/${clientId}/${encodeURIComponent(meta.file)}?v=${meta.version}`,
    boundingBox: meta.boundingBox,
    knownSides: meta.knownSides,
  };
}
