import type { ModelMetadata } from "@/features/model/schema";
import type { CameraPath } from "@/features/shots/schema";

/** The opening teaser: a drone-style flight up the south face, ending above the building. */
export function teaserPath(box: ModelMetadata["boundingBox"]): CameraPath {
  const height = box.max[1] - box.min[1];
  const width = Math.max(box.max[0] - box.min[0], box.max[2] - box.min[2]);
  const distance = Math.max(width, height) * 2.4;
  const center: [number, number, number] = [0, height * 0.5, 0];
  return {
    fov: 40,
    keyframes: [
      { t: 0, position: [distance * 0.35, height * 0.08, distance], target: [0, height * 0.3, 0] },
      { t: 5, position: [distance * 0.15, height * 0.9, distance * 0.9], target: center },
      { t: 9, position: [-distance * 0.2, height * 1.5, distance * 0.75], target: [0, height * 0.7, 0] },
    ],
  };
}

export function pathDuration(path: CameraPath): number {
  return path.keyframes[path.keyframes.length - 1].t;
}
