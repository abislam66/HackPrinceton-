import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadGeneratedMeta } from "@/features/model/generated";
import { loadModelInfo } from "@/features/model/load";
import { modelMetadataSchema, type ModelInfo } from "@/features/model/schema";
import { PROJECT_SLUG } from "@/features/project/schema";

const CLIENT_ID = /^[a-z0-9-]+$/;

/**
 * The stakeholder's own 3D model (a product decision: each stakeholder gets one).
 * Reads public/models/<project>/<clientId>/model.json. Until the builder has written one for this
 * stakeholder, falls back to the single project model (or its gray-box stand-in).
 */
export async function loadStakeholderModel(clientId: string, projectSlug: string = PROJECT_SLUG): Promise<ModelInfo> {
  // A project other than the demo uses its generated model when the building viewer has saved one.
  if (projectSlug !== PROJECT_SLUG) {
    const generated = await loadGeneratedMeta(projectSlug);
    if (generated) {
      return {
        url: `/api/models/${projectSlug}/glb?v=${generated.version}`,
        boundingBox: generated.boundingBox,
        knownSides: generated.knownSides,
        generated: true,
      };
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
