import type { ModelInfo } from "@/features/model/schema";
import type { CameraKeyframe, CameraPath, Shot } from "./schema";

/*
 * The pitch reel: the client's shots as one continuous flight, never longer than
 * MAX_REEL_SECONDS. Between two shots the camera swings around the building through a waypoint
 * above the roofline, so it flows from one shot into the next instead of cutting. Each keyframe
 * carries its shot's lens, and the viewer blends the field of view through the transition.
 * Pure, so the page, the tests and any export use the same plan.
 */

type Box = ModelInfo["boundingBox"];
type Vec3 = [number, number, number];

export const MAX_REEL_SECONDS = 30;
/** No shot shorter than this inside the reel, or it reads as a flash. */
const MIN_SHOT_SECONDS = 3;
/** Flight time from the end of one shot to the start of the next. */
const TRANSITION_SECONDS = 2;
/** The transition waypoint clears the roof by this share of the building's height. */
const WAYPOINT_LIFT = 0.15;

/** Where one shot sits in the reel, for captions and the shot counter. */
export type ReelCut = { shot: Shot; start: number; duration: number };

/** `path` is null when there are no shots to play. */
export type Reel = { path: CameraPath | null; cuts: ReelCut[]; duration: number };

/**
 * Plans the reel from the shots in order. Shots are sped up evenly to fit (same moves, faster);
 * if a shot would drop under MIN_SHOT_SECONDS, later shots are dropped instead.
 */
export function planReel(shots: Shot[], box: Box, maxSeconds = MAX_REEL_SECONDS): Reel {
  let chosen = shots.filter((s) => lengthOf(s.camera) > 0);
  const fit = (list: Shot[]) => {
    const budget = maxSeconds - TRANSITION_SECONDS * Math.max(list.length - 1, 0);
    const total = list.reduce((sum, s) => sum + lengthOf(s.camera), 0);
    return { budget, scale: total > 0 ? Math.min(1, budget / total) : 1 };
  };
  while (chosen.length > 1) {
    const { budget, scale } = fit(chosen);
    if (budget > 0 && chosen.every((s) => lengthOf(s.camera) * scale >= MIN_SHOT_SECONDS)) break;
    chosen = chosen.slice(0, -1);
  }
  if (chosen.length === 0) return { path: null, cuts: [], duration: 0 };
  const { scale } = fit(chosen);

  const keyframes: CameraKeyframe[] = [];
  const cuts: ReelCut[] = [];
  let offset = 0;
  chosen.forEach((shot, n) => {
    if (n > 0) {
      const a = keyframes[keyframes.length - 1];
      const b = shot.camera.keyframes[0];
      keyframes.push(waypoint(a, { ...b, fov: b.fov ?? shot.camera.fov }, box, offset + TRANSITION_SECONDS / 2));
      offset += TRANSITION_SECONDS;
    }
    const start = offset;
    for (const k of shot.camera.keyframes) {
      keyframes.push({ ...k, t: floorMs(offset + k.t * scale), fov: k.fov ?? shot.camera.fov });
    }
    offset = keyframes[keyframes.length - 1].t;
    cuts.push({ shot, start, duration: floorMs(offset - start) });
  });

  return {
    path: { fov: chosen[0].camera.fov, keyframes },
    cuts,
    duration: floorMs(offset),
  };
}

/** The shot playing (or being flown to) at `t` seconds into the reel. */
export function cutAt(reel: Reel, t: number): ReelCut | undefined {
  return reel.cuts.find((c) => t < c.start + c.duration) ?? reel.cuts.at(-1);
}

/**
 * Midway between two shots: swung around the building's center the short way, at the larger of
 * the two horizontal distances, and above the roofline so neighbors never get in the way.
 */
function waypoint(a: CameraKeyframe, b: CameraKeyframe, box: Box, t: number): CameraKeyframe {
  const cx = (box.min[0] + box.max[0]) / 2;
  const cz = (box.min[2] + box.max[2]) / 2;
  const height = box.max[1] - box.min[1];
  const angleA = Math.atan2(a.position[2] - cz, a.position[0] - cx);
  const angleB = Math.atan2(b.position[2] - cz, b.position[0] - cx);
  let delta = angleB - angleA;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const angle = angleA + delta / 2;
  const radius = Math.max(
    Math.hypot(a.position[0] - cx, a.position[2] - cz),
    Math.hypot(b.position[0] - cx, b.position[2] - cz),
  );
  const y = Math.max(a.position[1], b.position[1], box.max[1] + height * WAYPOINT_LIFT);
  const position: Vec3 = [round(cx + radius * Math.cos(angle)), round(y), round(cz + radius * Math.sin(angle))];
  const target: Vec3 = [
    round((a.target[0] + b.target[0]) / 2),
    round((a.target[1] + b.target[1]) / 2),
    round((a.target[2] + b.target[2]) / 2),
  ];
  const fovA = a.fov ?? 40;
  const fovB = b.fov ?? fovA;
  return { t: floorMs(t), position, target, fov: round((fovA + fovB) / 2) };
}

function lengthOf(path: CameraPath): number {
  return path.keyframes.at(-1)?.t ?? 0;
}

/** Round down to the millisecond so the reel can't creep past its limit. */
function floorMs(v: number): number {
  return Math.floor(v * 1000 + 1e-6) / 1000;
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
