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

/** A neighbouring building as a box, in the model's frame. Shots must not pass through one. */
export type ModelObstacle = { name: string; min: [number, number, number]; max: [number, number, number] };

/** What the viewer needs: where the GLB is (if built yet) and how big the building is. */
export type ModelInfo = {
  url: string | null;
  boundingBox: ModelMetadata["boundingBox"];
  knownSides: ModelMetadata["knownSides"];
  /** A model the building viewer generated for a project other than the demo. Its neighbors are not the demo's. */
  generated?: boolean;
  /** A generated model's own neighbours (they are in its GLB). Unset for the demo, whose neighbours are in data/. */
  obstacles?: ModelObstacle[];
};

/** Stand-in size used until the model builder has written a model. */
export const PLACEHOLDER_BOUNDING_BOX: ModelMetadata["boundingBox"] = {
  min: [-20, 0, -15],
  max: [20, 40, 15],
};
