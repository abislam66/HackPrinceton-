import type { CameraPath } from "./schema";

/*
 * Where the camera is at time t along a path. Shared by the viewer (to play it) and the shot
 * tools (to check it), so what is checked is what is shown. Pure, no three.js.
 *
 * The camera follows a centripetal Catmull-Rom spline through the keyframes, so it never stops
 * at a keyframe. Speed ramps up at the start and down at the end of the whole path only.
 */

type Vec3 = [number, number, number];
export type CameraPose = { position: Vec3; target: Vec3; fov: number };

/** Lowest camera height, in meters (the same floor the shot compiler enforces). */
const MIN_CAMERA_Y = 1;
/** Longest ease-in and ease-out at the ends of a path, in seconds. */
const MAX_RAMP_SECONDS = 1.5;

export function poseAt(path: CameraPath, t: number): CameraPose {
  const frames = path.keyframes;
  const first = frames[0];
  const last = frames[frames.length - 1];
  const fovOf = (i: number) => frames[i].fov ?? path.fov;
  if (frames.length === 1 || last.t <= 0) return { position: first.position, target: first.target, fov: fovOf(0) };

  const tau = easeTime(Math.min(Math.max(t, 0), last.t), last.t);
  let i = frames.findIndex((f, n) => n < frames.length - 1 && tau <= frames[n + 1].t);
  if (i === -1) i = frames.length - 2;
  const span = frames[i + 1].t - frames[i].t;
  const s = span > 0 ? (tau - frames[i].t) / span : 1;

  const pick = (get: (n: number) => Vec3) => {
    const p1 = get(i);
    const p2 = get(i + 1);
    const p0 = i > 0 ? get(i - 1) : reflect(p2, p1);
    const p3 = i + 2 < frames.length ? get(i + 2) : reflect(p1, p2);
    return centripetal(p0, p1, p2, p3, s);
  };
  const position = pick((n) => frames[n].position);
  // The spline can overshoot a little near eye-level keyframes; never below the 1 m floor.
  position[1] = Math.max(position[1], MIN_CAMERA_Y);
  return {
    position,
    target: pick((n) => frames[n].target),
    fov: fovOf(i) + (fovOf(i + 1) - fovOf(i)) * smooth(s),
  };
}

/**
 * Warps clock time so speed ramps up over the first `ramp` seconds and down over the last, with
 * constant speed between (a trapezoid velocity profile). Starts at 0 and ends at `duration`.
 */
function easeTime(t: number, duration: number): number {
  const ramp = Math.min(MAX_RAMP_SECONDS, duration / 4);
  if (ramp <= 0) return t;
  const v = duration / (duration - ramp);
  if (t < ramp) return (v * t * t) / (2 * ramp);
  if (t > duration - ramp) return duration - (v * (duration - t) ** 2) / (2 * ramp);
  return v * (t - ramp / 2);
}

/** Centripetal Catmull-Rom (alpha 0.5) between p1 and p2, by the Barry-Goldman pyramid. */
function centripetal(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, s: number): Vec3 {
  const knot = (a: Vec3, b: Vec3) => Math.max(Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])), 1e-6);
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const t = t1 + (t2 - t1) * s;
  const mix = (a: Vec3, b: Vec3, ta: number, tb: number): Vec3 => {
    const w = tb === ta ? 0 : (t - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

function reflect(about: Vec3, p: Vec3): Vec3 {
  return [2 * p[0] - about[0], 2 * p[1] - about[1], 2 * p[2] - about[2]];
}

function smooth(s: number): number {
  return s * s * (3 - 2 * s);
}
