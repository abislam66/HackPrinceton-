import type { CameraPath, Shot } from "./schema";

/*
 * The pitch reel: the client's shots played back to back with hard cuts, never longer than
 * MAX_REEL_SECONDS. Pure, so the page, the tests and any export use the same plan.
 */

export const MAX_REEL_SECONDS = 30;
/** No cut shorter than this, or the shot reads as a flash. */
const MIN_CUT_SECONDS = 3;

export type ReelCut = {
  shot: Shot;
  /** The shot's camera path, retimed to fit the reel. */
  path: CameraPath;
  /** When this cut starts, in seconds from the start of the reel. */
  start: number;
  duration: number;
};

export type Reel = { cuts: ReelCut[]; duration: number };

/**
 * Plans a reel from the shots in order. If they run past `maxSeconds`, every shot is sped up by
 * the same factor; if that would make a cut shorter than MIN_CUT_SECONDS, later shots are dropped
 * instead. The camera moves stay the same, only faster.
 */
export function planReel(shots: Shot[], maxSeconds = MAX_REEL_SECONDS): Reel {
  let chosen = shots.filter((s) => lengthOf(s.camera) > 0);
  while (chosen.length > 1) {
    const total = chosen.reduce((sum, s) => sum + lengthOf(s.camera), 0);
    const scale = Math.min(1, maxSeconds / total);
    if (chosen.every((s) => lengthOf(s.camera) * scale >= MIN_CUT_SECONDS)) break;
    chosen = chosen.slice(0, -1);
  }
  const total = chosen.reduce((sum, s) => sum + lengthOf(s.camera), 0);
  const scale = total > 0 ? Math.min(1, maxSeconds / total) : 1;

  let start = 0;
  const cuts = chosen.map((shot) => {
    const path = retime(shot.camera, scale);
    const duration = lengthOf(path);
    const cut = { shot, path, start, duration };
    start += duration;
    return cut;
  });
  return { cuts, duration: round(start) };
}

/** The cut playing at `t` seconds into the reel (the last one past the end). */
export function cutAt(reel: Reel, t: number): ReelCut | undefined {
  return reel.cuts.find((c) => t < c.start + c.duration) ?? reel.cuts.at(-1);
}

function retime(path: CameraPath, scale: number): CameraPath {
  if (scale === 1) return path;
  // Round down to the millisecond so the sum of cuts can't creep past the limit.
  return { ...path, keyframes: path.keyframes.map((k) => ({ ...k, t: Math.floor(k.t * scale * 1000) / 1000 })) };
}

function lengthOf(path: CameraPath): number {
  return path.keyframes.at(-1)?.t ?? 0;
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
