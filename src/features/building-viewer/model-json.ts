import { buildingSides, modelMetadataSchema, type ModelMetadata } from "@/features/model/schema";

/*
 * model.json for a generated building, in exactly the model builder's schema (features/model/schema.ts), so the
 * shot compiler and the viewer can use it like demo-project's. Claude returns the two facts only it knows (the
 * bounding box and the sides the photo shows); the server sets the rest. Pure functions, tested without a network.
 *
 * The schema has no field for named parts or notes: parts exist only as node names inside a GLB. So nothing about
 * parts is asked for or stored here.
 */

export const MODEL_FILE = "model.glb";

export const MODEL_JSON_RULES = `ALSO return the 3D model's metadata inside <model_json></model_json>, after </reply>, as JSON with exactly these keys:
{"boundingBox": {"min": [x, y, z], "max": [x, y, z]}, "knownSides": ["north" | "east" | "south" | "west", ...]}
- Use the same dimensions you used for SUBJECT, in metres. Axes: +Y up, +X east, -Z north. Origin: the centre of the building's footprint at ground level, so min[1] is 0 and max[1] is the building's full height.
- The box covers the subject building only, not SUBJECT.context.
- knownSides lists only the sides the attached photo clearly shows. With no photo, return []. Never list a side you cannot see.
- No other keys, no comments.`;

export type ModelJsonStatus = "generated" | "generated on retry" | "built from SUBJECT dims" | "not available";

/** The JSON inside <model_json>, or null when the tag is missing or the JSON does not parse. */
export function parseModelJsonBlock(text: string): unknown {
  const body = /<model_json>([\s\S]*?)<\/model_json>/.exec(text)?.[1];
  if (!body) return null;
  const json = body.trim().replace(/^```(?:json)?\s*\n/, "").replace(/\n```\s*$/, "");
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

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

/** SUBJECT.dims as written in the subject block: `dims: { width: 30, depth: 20, height: 90 }`. */
export function dimsFromSubject(subject: string): { width: number; depth: number; height: number } | null {
  const block = /dims\s*:\s*\{([^}]*)\}/.exec(subject)?.[1];
  if (!block) return null;
  const read = (key: string) => {
    const n = Number(new RegExp(`${key}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(block)?.[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const width = read("width"), depth = read("depth"), height = read("height");
  return width && depth && height ? { width, depth, height } : null;
}

/** The last resort: a box from SUBJECT.dims centred on the origin. Null when the subject has no readable dims. */
export function fallbackModelJson(subject: string, projectSlug: string, sides: unknown): ModelMetadata | null {
  const dims = dimsFromSubject(subject);
  if (!dims) return null;
  const result = validateModelJson(
    {
      boundingBox: {
        min: [-dims.width / 2, 0, -dims.depth / 2],
        max: [dims.width / 2, dims.height, dims.depth / 2],
      },
      knownSides: cleanSides(sides),
    },
    projectSlug,
  );
  return result.ok ? result.model : null;
}

/** The prompt for the one retry: the subject Claude wrote, what failed, and the rules again. No web search. */
export function retryPrompt(subject: string, errors: string[], photoAttached: boolean): string {
  return `You wrote this SUBJECT block for a 3D building viewer:

${subject}

Your <model_json> for it failed validation:
${errors.map((e) => `- ${e}`).join("\n")}

Return a corrected one. ${photoAttached ? "The photo is attached again." : "No photo was attached, so knownSides must be []."}
${MODEL_JSON_RULES.replace("ALSO return", "Return").replace(", after </reply>,", "")}`;
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
