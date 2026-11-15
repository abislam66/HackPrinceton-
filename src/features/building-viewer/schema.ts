import { z } from "zod";
import type { ModelMetadata } from "@/features/model/schema";

/** Limits for the building viewer form. Checked on the server; the browser repeats the cheap ones. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_MEDIA_TYPES = ["image/jpeg", "image/png"] as const;
export type PhotoMediaType = (typeof PHOTO_MEDIA_TYPES)[number];

export const viewerFormSchema = z.object({
  address: z.string().trim().min(5, "Enter a street address.").max(200, "Keep the address under 200 characters."),
  buildingName: z.string().trim().max(120, "Keep the name under 120 characters.").default(""),
  knownFacts: z.string().trim().max(500, "Keep the known facts under 500 characters.").default(""),
  notes: z.string().trim().max(1000, "Keep the notes under 1000 characters.").default(""),
  /** The project this viewer belongs to, e.g. from /building-viewer?project=<slug>. Empty: derived from the name. */
  projectSlug: z.string().trim().max(64).regex(/^[a-z0-9-]*$/, "The project id has unexpected characters.").optional(),
});
export type ViewerInput = z.infer<typeof viewerFormSchema>;

/**
 * Identify a JPEG or PNG from its first bytes. The browser's claimed type is not trusted.
 * Returns null for anything else.
 */
export function detectPhotoType(bytes: Uint8Array): PhotoMediaType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47];
  if (bytes.length >= 4 && png.every((b, i) => bytes[i] === b)) return "image/png";
  return null;
}

/** The last NDJSON line of a successful run. */
export type ViewerResult = {
  type: "result";
  /** The viewer page: the locked scaffold with the generated GLB embedded. */
  html: string;
  reply: string;
  geocode_status: string;
  context_status: string;
  /** Always false: the model returns data, not page code, so it can't change the scaffold. Kept for stored records. */
  drift: boolean;
  /** model.json in the model builder's schema, measured from the built building. */
  model_json: ModelMetadata | null;
  /** "generated", or "generated on retry" when the first scene failed validation. */
  model_json_status: string;
  /** The project this viewer belongs to: the form's projectSlug, else made from the name or address. */
  project_slug: string;
  /** Which sides the photo backs and which are inferred. Shots may frame all of them; the reply says so. */
  sides: { photo: ModelMetadata["knownSides"]; inferred: ModelMetadata["knownSides"] };
  /** True when the GLB was saved on the project, so its Projects pages show it. */
  model_saved: boolean;
};

/** One NDJSON line the generate route streams back to the page. */
export type ViewerEvent =
  | { type: "step"; step: ViewerStep; status: "start" | "done" | "skipped"; detail?: string }
  | ViewerResult
  | { type: "error"; error: string; step: string };

export type ViewerStep = "geocode" | "context" | "model" | "assemble";
