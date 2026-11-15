import type { ModelInfo } from "@/features/model/schema";
import type { Obstacle } from "./compile";
import { poseAt } from "./motion";
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
/** Transition flight speed, and its time limits. */
const CRUISE_M_PER_S = 55;
/** Slowest a transition flies, so a short hop between slow shots doesn't crawl. */
const MIN_TRANSITION_SPEED = 12;
const MIN_TRANSITION_SECONDS = 1;
const MAX_TRANSITION_SECONDS = 12;
/** Transitions that must cross the building go above the roof by this share of its height. */
const WAYPOINT_LIFT = 0.15;
/** Without neighbor data, transitions climb to this share of the building's height first. */
const DEFAULT_SAFE_SHARE = 0.45;
/** Clearance above the tallest neighbor, and around the building, in meters. */
const NEIGHBOR_CLEARANCE_M = 6;
const BUILDING_CLEARANCE_M = 4;
/** Top camera speed anywhere in the reel; faster reads as a whip, not a flight. */
const MAX_SPEED_M_PER_S = 70;
/** Clearance the reel's camera keeps from the building and every neighbor, in meters. */
const CLEARANCE_M = 2;
/** How often the planned flight is checked, in seconds. */
const FLIGHT_STEP_SECONDS = 0.1;
/** Shot lists up to this long are reordered to fly the shortest route. */
const MAX_REORDER = 6;

/** Where one shot sits in the reel, for captions and the shot counter. */
export type ReelCut = { shot: Shot; start: number; duration: number };

/** `path` is null when there are no shots to play. */
export type Reel = { path: CameraPath | null; cuts: ReelCut[]; duration: number };

/**
 * Plans the reel. Shots are put in the order with the least flying between them (shots on one
 * side play together), then joined by transitions that climb straight up from the end of one
 * shot, cross above the roofline, and drop straight down onto the next, so they never pass
 * through a neighbor. Shots are sped up evenly to fit; if one would drop under MIN_SHOT_SECONDS,
 * shots are dropped from the end instead.
 */
export function planReel(
  shots: Shot[],
  box: Box,
  options: { maxSeconds?: number; obstacles?: Obstacle[] } = {},
): Reel {
  const maxSeconds = options.maxSeconds ?? MAX_REEL_SECONDS;
  const height = box.max[1] - box.min[1];
  const heights = {
    // High enough to clear every neighbor; without neighbor data, a share of the building's height.
    safe: options.obstacles
      ? Math.max(0, ...options.obstacles.map((o) => o.max[1])) + NEIGHBOR_CLEARANCE_M
      : box.min[1] + height * DEFAULT_SAFE_SHARE,
    roof: box.max[1] + height * WAYPOINT_LIFT,
  };
  const fit = (list: Shot[]) => {
    const legs = list.slice(1).map((shot, n) => transition(lastFrame(list[n]), firstFrame(shot), heights, box));
    const budget = maxSeconds - legs.reduce((sum, leg) => sum + leg.seconds, 0);
    const total = list.reduce((sum, s) => sum + lengthOf(s.camera), 0);
    return { legs, budget, scale: total > 0 ? Math.min(1, budget / total) : 1 };
  };
  const build = (list: Shot[]): Reel | null => {
    const { legs, budget, scale } = fit(list);
    if (budget <= 0 || list.some((s) => lengthOf(s.camera) * scale < MIN_SHOT_SECONDS)) return null;
    const keyframes: CameraKeyframe[] = [];
    const cuts: ReelCut[] = [];
    let offset = 0;
    list.forEach((shot, n) => {
      if (n > 0) {
        const leg = legs[n - 1];
        for (const w of leg.waypoints) keyframes.push({ ...w, t: floorMs(offset + w.t) });
        offset += leg.seconds;
      }
      const start = offset;
      for (const k of shot.camera.keyframes) {
        keyframes.push({ ...k, t: floorMs(offset + k.t * scale), fov: k.fov ?? shot.camera.fov });
      }
      offset = keyframes[keyframes.length - 1].t;
      cuts.push({ shot, start, duration: floorMs(offset - start) });
    });
    return { path: { fov: list[0].camera.fov, keyframes }, cuts, duration: floorMs(offset) };
  };

  // Drop shots from the end of the route until the whole flight fits, stays clear of the building
  // and the neighbors, and never moves faster than MAX_SPEED. Fewer calm shots beat five rushed ones.
  let chosen = shortestRoute(shots.filter((s) => lengthOf(s.camera) > 0));
  while (chosen.length > 0) {
    const reel = build(chosen);
    if (reel && (chosen.length === 1 || flightProblems(reel, box, options.obstacles ?? []).length === 0)) return reel;
    chosen = shortestRoute(chosen.slice(0, -1));
  }
  return { path: null, cuts: [], duration: 0 };
}

/**
 * Everything wrong with a planned reel, checked the way the viewer plays it: frames inside the
 * building or a neighbor (with clearance), below 1 m, or faster than MAX_SPEED_M_PER_S.
 */
export function flightProblems(reel: Reel, box: Box, obstacles: Obstacle[]): string[] {
  if (!reel.path) return [];
  const problems = new Set<string>();
  const near = (p: Vec3, min: Vec3, max: Vec3, m: number) => p.every((v, a) => v >= min[a] - m && v <= max[a] + m);
  let prev = poseAt(reel.path, 0).position;
  for (let t = FLIGHT_STEP_SECONDS; t <= reel.duration + 1e-9; t += FLIGHT_STEP_SECONDS) {
    const { position } = poseAt(reel.path, t);
    if (near(position, box.min, box.max, CLEARANCE_M)) problems.add(`within ${CLEARANCE_M} m of the building at ${t.toFixed(1)} s`);
    const hit = obstacles.find((o) => near(position, o.min, o.max, CLEARANCE_M));
    if (hit) problems.add(`within ${CLEARANCE_M} m of ${hit.name} at ${t.toFixed(1)} s`);
    if (dist(prev, position) / FLIGHT_STEP_SECONDS > MAX_SPEED_M_PER_S) problems.add(`faster than ${MAX_SPEED_M_PER_S} m/s at ${t.toFixed(1)} s`);
    prev = position;
  }
  return [...problems];
}

/** The shot playing (or being flown to) at `t` seconds into the reel. */
export function cutAt(reel: Reel, t: number): ReelCut | undefined {
  return reel.cuts.find((c) => t < c.start + c.duration) ?? reel.cuts.at(-1);
}

/** A shot's first or last keyframe, with the camera's speed there (m/s). */
type Frame = { position: Vec3; target: Vec3; fov: number; speed: number };

/**
 * The flight from the end of one shot (a) to the start of the next (b): straight up above the
 * neighbors if a is low, across (over the roof only if the building is in the way), and straight
 * down onto b. Waypoint times are relative to the end of shot a; b itself is not included.
 */
function transition(
  a: Frame,
  b: Frame,
  heights: { safe: number; roof: number },
  box: Box,
): { seconds: number; waypoints: CameraKeyframe[] } {
  let cruise = Math.max(heights.safe, Math.min(a.position[1], b.position[1]));
  const across = (y: number): [Vec3, Vec3] => [
    [a.position[0], Math.max(a.position[1], y), a.position[2]],
    [b.position[0], Math.max(b.position[1], y), b.position[2]],
  ];
  let [upA, upB] = across(cruise);
  if (segmentNearBox(upA, upB, box, BUILDING_CLEARANCE_M)) {
    cruise = Math.max(cruise, heights.roof);
    [upA, upB] = across(cruise);
  }
  const legs: { at: Vec3; target: Vec3; fov: number }[] = [];
  if (dist(a.position, upA) > 1) legs.push({ at: upA, target: a.target, fov: a.fov });
  if (dist(upA, upB) > 1 && dist(upB, b.position) > 1) legs.push({ at: upB, target: b.target, fov: b.fov });
  const points = [a.position, ...legs.map((l) => l.at), b.position];
  const lengths = points.slice(1).map((p, i) => dist(points[i], p));
  const total = lengths.reduce((sum, d) => sum + d, 0);
  // Fly about as fast as the shots on either side, so the camera neither lurches nor crawls.
  const speed = clamp(a.speed + b.speed, MIN_TRANSITION_SPEED, CRUISE_M_PER_S);
  const seconds = clamp(total / speed, MIN_TRANSITION_SECONDS, MAX_TRANSITION_SECONDS);
  let along = 0;
  const waypoints = legs.map((l, i) => {
    along += lengths[i];
    return { t: total > 0 ? (seconds * along) / total : seconds / 2, position: roundVec(l.at), target: l.target, fov: l.fov };
  });
  return { seconds, waypoints };
}

/** The order of shots with the least flying between them (ties keep the given order). */
function shortestRoute(shots: Shot[]): Shot[] {
  if (shots.length <= 2 || shots.length > MAX_REORDER) return shots;
  let best = shots;
  let bestCost = Infinity;
  for (const order of permutations(shots)) {
    const route = order;
    let cost = 0;
    for (let i = 1; i < route.length; i++) cost += dist(lastFrame(route[i - 1]).position, firstFrame(route[i]).position);
    if (cost < bestCost - 1e-6) {
      bestCost = cost;
      best = route;
    }
  }
  return best;
}

function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) yield [items[i], ...tail];
  }
}

function firstFrame(shot: Shot): Frame {
  const [k, next] = shot.camera.keyframes;
  return { position: k.position, target: k.target, fov: k.fov ?? shot.camera.fov, speed: segmentSpeed(k, next) };
}

function lastFrame(shot: Shot): Frame {
  const frames = shot.camera.keyframes;
  const k = frames[frames.length - 1];
  return { position: k.position, target: k.target, fov: k.fov ?? shot.camera.fov, speed: segmentSpeed(frames[frames.length - 2], k) };
}

function segmentSpeed(a: CameraKeyframe | undefined, b: CameraKeyframe | undefined): number {
  if (!a || !b || b.t <= a.t) return 0;
  return dist(a.position, b.position) / (b.t - a.t);
}

/** Does the segment pass within `margin` of the box? Sampled every couple of meters. */
function segmentNearBox(a: Vec3, b: Vec3, box: Box, margin: number): boolean {
  const steps = Math.max(1, Math.ceil(dist(a, b) / 2));
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const p = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
    if (p.every((v, axis) => v >= box.min[axis] - margin && v <= box.max[axis] + margin)) return true;
  }
  return false;
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function roundVec(v: Vec3): Vec3 {
  return [round(v[0]), round(v[1]), round(v[2])];
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
