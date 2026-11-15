import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadModelInfo } from "@/features/model/load";
import { PLACEHOLDER_BOUNDING_BOX, buildingSides, modelMetadataSchema, type ModelInfo } from "@/features/model/schema";
import { PROJECT_SLUG } from "@/features/project/schema";

const CLIENT_ID = /^[a-z0-9-]+$/;

/**
 * The stakeholder's own 3D model (a product decision: each stakeholder gets one).
 * Reads public/models/<project>/<clientId>/model.json. Until the builder has written one for this
 * stakeholder, falls back to the single project model (or its gray-box stand-in).
 *
 * The models are of the demo project's building. A stakeholder of a project added from scouting (or opened from one)
 * gets the gray-box stand-in, so its shots never frame Morgan Hall North.
 */
export async function loadStakeholderModel(clientId: string, projectSlug: string = PROJECT_SLUG): Promise<ModelInfo> {
  if (projectSlug !== PROJECT_SLUG) {
    // Imported here: the store imports the proposal scenario, which imports this module.
    const { projectBuilding } = await import("@/features/project-agent/store");
    if ((await projectBuilding(projectSlug))?.kind === "scouted") {
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
