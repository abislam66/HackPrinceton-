import { z } from "zod";

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const buildingSides = ["north", "east", "south", "west"] as const;

/**
 * model.json, written by the Python model builder next to model.glb.
 * This is the contract between model-builder/ and the web app.
 *
 * Coordinates: meters, glTF convention. +Y up, +X east, -Z north.
 * Origin: center of the building footprint at ground level.
 */
export const modelMetadataSchema = z.object({
  projectSlug: z.string(),
  /** GLB file name in the same folder. */
  file: z.string(),
  version: z.number().int().positive(),
  units: z.literal("meters"),
  boundingBox: z.object({ min: vec3, max: vec3 }),
  /** Sides with real reference. Shots only frame these. */
  knownSides: z.array(z.enum(buildingSides)),
});
export type ModelMetadata = z.infer<typeof modelMetadataSchema>;

/** What the viewer needs: where the GLB is (if built yet) and how big the building is. */
export type ModelInfo = {
  url: string | null;
  boundingBox: ModelMetadata["boundingBox"];
  knownSides: ModelMetadata["knownSides"];
};

/** Stand-in size used until the model builder has written a model. */
export const PLACEHOLDER_BOUNDING_BOX: ModelMetadata["boundingBox"] = {
  min: [-20, 0, -15],
  max: [20, 40, 15],
};
