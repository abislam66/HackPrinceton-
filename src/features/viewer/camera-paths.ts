import type { ModelMetadata } from "@/features/model/schema";
import type { CameraPath } from "@/features/shots/schema";

type Box = ModelMetadata["boundingBox"];
type Vec3 = [number, number, number];

/** Center of the model's bounding box. The model's origin is the footprint center, which can sit off the building. */
export function boxCenter(box: Box): Vec3 {
  return [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
}

/** Camera distance at which the whole model fits the view, with a little margin. */
export function fitDistance(box: Box, fov: number, margin = 1.15): number {
  const radius = Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) / 2;
  return (radius / Math.sin(((fov / 2) * Math.PI) / 180)) * margin;
}

export const VIEW_FOV = 35;

/** Named viewpoints for the view buttons: from each side, slightly raised, and from above at an angle. */
export function presetViews(box: Box): Record<string, { position: Vec3; target: Vec3 }> {
  const [cx, cy, cz] = boxCenter(box);
  const d = fitDistance(box, VIEW_FOV);
  const lift = cy * 0.6;
  const target: Vec3 = [cx, cy, cz];
  return {
    Aerial: { position: [cx + d * 0.55, cy + d * 0.7, cz + d * 0.55], target },
    North: { position: [cx, cy + lift, cz - d], target }, // north is -Z
    South: { position: [cx, cy + lift, cz + d], target },
    East: { position: [cx + d, cy + lift, cz], target },
    West: { position: [cx - d, cy + lift, cz], target },
  };
}

/** The opening teaser: a drone-style rise from street level on the south-east, ending in a three-quarter aerial view. */
export function teaserPath(box: Box): CameraPath {
  const [cx, cy, cz] = boxCenter(box);
  const height = box.max[1] - box.min[1];
  const d = fitDistance(box, VIEW_FOV);
  return {
    fov: VIEW_FOV,
    keyframes: [
      { t: 0, position: [cx + d * 0.45, height * 0.06, cz + d * 0.9], target: [cx, height * 0.35, cz] },
      { t: 5, position: [cx + d * 0.2, height * 0.55, cz + d * 0.95], target: [cx, cy, cz] },
      { t: 9, position: [cx + d * 0.55, cy + d * 0.7, cz + d * 0.55], target: [cx, cy, cz] },
    ],
  };
}

export function pathDuration(path: CameraPath): number {
  return path.keyframes[path.keyframes.length - 1].t;
}
