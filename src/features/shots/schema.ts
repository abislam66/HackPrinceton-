import { z } from "zod";
import { buildingSides } from "@/features/model/schema";

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

/** One camera keyframe. Same coordinates as the model: meters, +Y up, -Z north. */
export const cameraKeyframeSchema = z.object({
  /** Seconds from the start of the shot. */
  t: z.number().min(0),
  position: vec3,
  target: vec3,
});
export type CameraKeyframe = z.infer<typeof cameraKeyframeSchema>;

export const cameraPathSchema = z.object({
  /** Vertical field of view in degrees. */
  fov: z.number().min(5).max(120),
  keyframes: z.array(cameraKeyframeSchema).min(1),
});
export type CameraPath = z.infer<typeof cameraPathSchema>;

/** A shot in the shot list. The viewer plays `camera`; the rest is for the crew. */
export const shotSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  platform: z.enum(["drone", "ground"]),
  lens: z.string(),
  timeOfDay: z.string(),
  constructionPhase: z.string(),
  /** The side of the building the shot frames. Must be one of the model's known sides. */
  side: z.enum(buildingSides),
  camera: cameraPathSchema,
});
export type Shot = z.infer<typeof shotSchema>;

export const shotListSchema = z.array(shotSchema);
