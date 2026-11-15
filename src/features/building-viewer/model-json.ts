import { buildingSides, modelMetadataSchema, type ModelMetadata } from "@/features/model/schema";

/*
 * model.json for a generated building, in exactly the model builder's schema (features/model/schema.ts), so the
 * shot compiler and the viewer can use it like demo-project's. The server measures the bounding box from the
 * building it built and sets the rest. Pure functions, tested without a network.
 */

export const MODEL_FILE = "model.glb";

/** Sides in the schema's order, without duplicates or unknown names. */
function cleanSides(value: unknown): ModelMetadata["knownSides"] {
  const given = Array.isArray(value) ? value : [];
  return buildingSides.filter((side) => given.includes(side));
}

/**
 * Build model.json from Claude's facts and check it against the schema plus the sanity rules the viewer relies on.
 * The server, not the model, sets projectSlug, file, version and units.
 */
export function validateModelJson(
  raw: unknown,
  projectSlug: string,
): { ok: true; model: ModelMetadata } | { ok: false; errors: string[] } {
  if (raw === null || typeof raw !== "object") return { ok: false, errors: ["<model_json> is missing or is not a JSON object"] };
  const facts = raw as { boundingBox?: unknown; knownSides?: unknown };
  const candidate = {
    projectSlug,
    file: MODEL_FILE,
    version: 1,
    units: "meters" as const,
    boundingBox: facts.boundingBox,
    knownSides: facts.knownSides,
  };
  const parsed = modelMetadataSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "model_json"}: ${i.message}`) };
  }
  const { min, max } = parsed.data.boundingBox;
  const errors: string[] = [];
  ["x", "y", "z"].forEach((axis, i) => {
    if (!(max[i] > min[i])) errors.push(`boundingBox: max ${axis} must be greater than min ${axis}`);
  });
  if (Math.abs(min[1]) > 0.5) errors.push("boundingBox: min y must be 0 (ground level)");
  if (max[1] > 1000) errors.push("boundingBox: height over 1000 m");
  if (Math.max(max[0] - min[0], max[2] - min[2]) > 1000) errors.push("boundingBox: footprint over 1000 m");
  if (errors.length) return { ok: false, errors };
  return { ok: true, model: { ...parsed.data, knownSides: cleanSides(parsed.data.knownSides) } };
}

/** A project slug from a name or address: lowercase words joined by hyphens, at most 60 characters. */
export function slugFrom(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "generated-building";
}

/** "north (photo), south (photo), east (inferred), west (inferred)": every side, labelled by its evidence. */
export function sideSummary(sides: { photo: string[]; inferred: string[] }): string {
  return buildingSides
    .map((side) => `${side} (${sides.photo.includes(side) ? "photo" : "inferred"})`)
    .join(", ");
}
