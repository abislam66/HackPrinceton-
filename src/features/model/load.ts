import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PROJECT_SLUG } from "@/features/project/schema";
import { PLACEHOLDER_BOUNDING_BOX, buildingSides, modelMetadataSchema, type ModelInfo } from "./schema";

/** Reads public/models/<project>/model.json. No file means no model has been built yet. */
export async function loadModelInfo(): Promise<ModelInfo> {
  const file = path.join(process.cwd(), "public", "models", PROJECT_SLUG, "model.json");
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { url: null, boundingBox: PLACEHOLDER_BOUNDING_BOX, knownSides: [...buildingSides] };
  }
  const meta = modelMetadataSchema.parse(JSON.parse(raw));
  return {
    url: `/models/${PROJECT_SLUG}/${meta.file}?v=${meta.version}`,
    boundingBox: meta.boundingBox,
    knownSides: meta.knownSides,
  };
}
