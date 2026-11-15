import type { buildingSides, ModelInfo, ModelMetadata } from "@/features/model/schema";
import type { ShotIntent } from "./intent";
import { shotListSchema, type CameraKeyframe, type CameraPath, type Shot } from "./schema";

/*
 * Shot compiler: turns an LLM-chosen shot intent into a camera path.
 * The LLM never writes coordinates. This module is pure (no I/O) so it can be tested directly.
 */

type Box = ModelMetadata["boundingBox"];
type Vec3 = [number, number, number];
type Side = (typeof buildingSides)[number];

/** Clearance the camera keeps from the building, in meters. */
const POSITION_CLEARANCE = 2;
/** How far outside the building the camera may aim, in meters. */
const TARGET_SLACK = 5;
const MIN_CAMERA_Y = 1;
const EYE_HEIGHT = 1.6;
/** Distance from the face never goes below this, so tiny boxes still clear POSITION_CLEARANCE. */
const MIN_STANDOFF = POSITION_CLEARANCE + 1;
const DEFAULT_FOV = 40;
const MAX_SHOTS = 5;

/** Outward direction for each side. +X east, -Z north. */
const OUTWARD: Record<Side, Vec3> = {
  north: [0, 0, -1],
  south: [0, 0, 1],
  east: [1, 0, 0],
  west: [-1, 0, 0],
};

/**
 * Lens string to field of view in degrees, using the full-frame 36 mm width:
 * 24mm -> 74, 35mm -> 54, 50mm -> 40, 70mm -> 29. Unparseable lenses get DEFAULT_FOV.
 */
export function lensToFov(lens: string): number {
  const match = /(\d+(?:\.\d+)?)\s*mm/i.exec(lens);
  const mm = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(mm) || mm <= 0) return DEFAULT_FOV;
  const fov = (2 * Math.atan(36 / (2 * mm)) * 180) / Math.PI;
  return round(clamp(fov, 5, 120));
}

/** Frame of reference for one side of the box. */
function sideFrame(box: Box, side: Side) {
  const [minX, minY, minZ] = box.min;
  const [maxX, maxY, maxZ] = box.max;
  const center: Vec3 = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  const halfX = (maxX - minX) / 2;
  const halfZ = (maxZ - minZ) / 2;
  const height = maxY - minY;
  const largest = Math.max(maxX - minX, height, maxZ - minZ);
  const n = OUTWARD[side];
  const alongX = n[0] !== 0;
  /** Lateral axis along the face, in the ground plane. */
  const u: Vec3 = alongX ? [0, 0, 1] : [1, 0, 0];
  const halfNormal = alongX ? halfX : halfZ;
  const halfLateral = alongX ? halfZ : halfX;
  const circumradius = Math.hypot(halfX, halfZ);

  /** Ground-plane point: `normal` m out from the box center along n, `lateral` m along u, at absolute height y. */
  const at = (normal: number, lateral: number, y: number): Vec3 => [
    center[0] + n[0] * normal + u[0] * lateral,
    y,
    center[2] + n[2] * normal + u[2] * lateral,
  ];
  /** A point `standoff` m outside the face. */
  const offFace = (standoff: number, lateral: number, y: number) =>
    at(halfNormal + Math.max(standoff, MIN_STANDOFF), lateral, y);
  /** A point on the face plane. */
  const onFace = (lateral: number, y: number) => at(halfNormal, lateral, y);
  /** Height as a fraction of the building, from its base. */
  const y = (fraction: number) => minY + fraction * height;

  return { center, n, u, height, largest, halfLateral, circumradius, maxY, at, offFace, onFace, y };
}

/** Compiles one intent into a camera path. Pure; does not check invariants. */
export function compileCameraPath(intent: ShotIntent, box: Box): CameraPath {
  const f = sideFrame(box, intent.side);
  const d = intent.distance * f.largest;
  const h = Math.max(f.y(intent.height), MIN_CAMERA_Y);
  const T = intent.durationSec;
  const fov = lensToFov(intent.lens);
  let keyframes: CameraKeyframe[];

  switch (intent.move) {
    case "rise": {
      const top = Math.max(f.y(1.2), h);
      const lat = f.halfLateral * 0.15;
      // Starts low and close (neighbors block low views from far out), pulls back as it climbs.
      keyframes = [
        { t: 0, position: f.offFace(d * 0.3, lat, Math.max(f.y(0.05), 2)), target: f.onFace(0, f.y(0.3)) },
        { t: T * 0.55, position: f.offFace(d * 0.65, lat * 0.5, f.y(0.8)), target: f.onFace(0, f.y(0.5)) },
        { t: T, position: f.offFace(d, 0, top), target: f.onFace(0, f.y(0.6)) },
      ];
      break;
    }
    case "orbit": {
      // ~60 degree arc centered on the side, constant height, around the box center.
      const radius = f.circumradius + Math.max(d, MIN_STANDOFF);
      const camY = Math.max(h, 2);
      const target: Vec3 = [f.center[0], f.y(0.5), f.center[2]];
      const angles = [-30, -10, 10, 30];
      keyframes = angles.map((deg, i) => {
        const a = (deg * Math.PI) / 180;
        return {
          t: (T * i) / (angles.length - 1),
          position: f.at(radius * Math.cos(a), radius * Math.sin(a), camY),
          target,
        };
      });
      break;
    }
    case "push-in": {
      const focusY = clamp(h, f.y(0.2), f.y(0.8));
      keyframes = [
        { t: 0, position: f.offFace(d, 0, h), target: f.onFace(0, focusY) },
        { t: T * 0.5, position: f.offFace(d * 0.8, 0, h), target: f.onFace(0, focusY) },
        { t: T, position: f.offFace(d * 0.6, 0, h), target: f.onFace(0, focusY) },
      ];
      break;
    }
    case "track": {
      const camY = Math.max(h, 2);
      const span = f.halfLateral + d * 0.25;
      const targetY = clamp(camY, f.y(0.2), f.y(0.7));
      // The aim point slides with the camera but stays on the face.
      const aim = Math.min(span * 0.5, f.halfLateral);
      keyframes = [
        { t: 0, position: f.offFace(d, -span, camY), target: f.onFace(-aim, targetY) },
        { t: T * 0.5, position: f.offFace(d, 0, camY), target: f.onFace(0, targetY) },
        { t: T, position: f.offFace(d, span, camY), target: f.onFace(aim, targetY) },
      ];
      break;
    }
    case "reveal": {
      // Starts high and nearly top-down, then descends to an oblique view of the face.
      const high = f.maxY + Math.max(d * 0.8, TARGET_SLACK);
      const end = Math.max(h, f.y(0.4));
      keyframes = [
        { t: 0, position: f.offFace(d * 0.3, 0, high), target: f.onFace(0, f.y(0.2)) },
        { t: T * 0.5, position: f.offFace(d * 0.7, 0, (high + end) / 2), target: f.onFace(0, f.y(0.35)) },
        { t: T, position: f.offFace(d, 0, end), target: f.onFace(0, f.y(0.5)) },
      ];
      break;
    }
    case "ground-hero": {
      // Eye height near the base, low angle up at the face, with a slow drift in. A person on the
      // street stands close; from far out at eye level the neighbors would fill the frame.
      const lat = f.halfLateral * 0.1;
      const g = clamp(f.height * 0.4, 12, d);
      keyframes = [
        { t: 0, position: f.offFace(g, -lat, EYE_HEIGHT), target: f.onFace(0, f.y(0.6)) },
        { t: T * 0.5, position: f.offFace(g * 0.9, 0, EYE_HEIGHT), target: f.onFace(0, f.y(0.65)) },
        { t: T, position: f.offFace(g * 0.8, lat, EYE_HEIGHT), target: f.onFace(0, f.y(0.7)) },
      ];
      break;
    }
  }

  return {
    fov,
    keyframes: keyframes.map((k) => ({ t: round(k.t), position: roundVec(k.position), target: roundVec(k.target) })),
  };
}

/** Returns every invariant the path breaks; empty means it is safe to play. */
export function checkCameraPath(path: CameraPath, box: Box, obstacles: Obstacle[] = []): string[] {
  const problems: string[] = [];
  problems.push(...sightProblems(path, obstacles));
  path.keyframes.forEach((k, i) => {
    if (insideExpanded(k.position, box, POSITION_CLEARANCE)) {
      problems.push(`keyframe ${i}: camera within ${POSITION_CLEARANCE} m of the building`);
    }
    if (k.position[1] < MIN_CAMERA_Y) problems.push(`keyframe ${i}: camera below ${MIN_CAMERA_Y} m`);
    if (!insideExpanded(k.target, box, TARGET_SLACK)) {
      problems.push(`keyframe ${i}: target more than ${TARGET_SLACK} m from the building`);
    }
    if (i > 0 && !(k.t > path.keyframes[i - 1].t)) problems.push(`keyframe ${i}: time does not increase`);
    if (![...k.position, ...k.target, k.t].every(Number.isFinite)) problems.push(`keyframe ${i}: non-finite value`);
  });
  return problems;
}

export type CompileResult =
  | { ok: true; shot: Omit<Shot, "id"> }
  | { ok: false; name: string; reasons: string[] };

/**
 * Compiles one intent and enforces the invariants. On failure, pushes the camera 25% further out
 * and tries once more. Intents on sides without real reference are rejected.
 */
export function compileShot(
  intent: ShotIntent,
  model: Pick<ModelInfo, "boundingBox" | "knownSides">,
  obstacles: Obstacle[] = [],
): CompileResult {
  if (!model.knownSides.includes(intent.side)) {
    return { ok: false, name: intent.name, reasons: [`side "${intent.side}" has no real reference`] };
  }
  // The intent as given first, then small adjustments: closer (clears neighbors on low shots),
  // further out (clears the building), then a little higher. The first clean one wins.
  const variants: [number, number][] = [[1, 0], [0.75, 0], [0.55, 0], [1.25, 0], [1, 0.3], [0.75, 0.3], [0.55, 0.5]];
  let camera: CameraPath | null = null;
  let reasons: string[] = [];
  for (const [scale, lift] of variants) {
    const tried = { ...intent, distance: intent.distance * scale, height: Math.min(intent.height + lift, 1.6) };
    const candidate = compileCameraPath(tried, model.boundingBox);
    const problems = checkCameraPath(candidate, model.boundingBox, obstacles);
    if (problems.length === 0) {
      camera = candidate;
      break;
    }
    if (reasons.length === 0) reasons = problems;
  }
  if (!camera) return { ok: false, name: intent.name, reasons };
  const { name, description, platform, lens, timeOfDay, constructionPhase, side } = intent;
  return { ok: true, shot: { name, description, platform, lens, timeOfDay, constructionPhase, side, camera } };
}

export type CompiledShotList = {
  shots: Shot[];
  dropped: { name: string; reasons: string[] }[];
};

/**
 * Compiles a list of intents into at most five shots with stable ids `${clientId}-shot-${n}`,
 * parsed with shotListSchema. The caller decides what to do when fewer than three survive.
 */
export function compileShotList(
  intents: ShotIntent[],
  model: Pick<ModelInfo, "boundingBox" | "knownSides">,
  clientId: string,
  obstacles: Obstacle[] = [],
): CompiledShotList {
  const kept: Omit<Shot, "id">[] = [];
  const dropped: CompiledShotList["dropped"] = [];
  for (const intent of intents) {
    const result = compileShot(intent, model, obstacles);
    if (result.ok) kept.push(result.shot);
    else dropped.push({ name: result.name, reasons: result.reasons });
  }
  const shots = shotListSchema.parse(
    kept.slice(0, MAX_SHOTS).map((shot, i) => ({ id: `${clientId}-shot-${i + 1}`, ...shot })),
  );
  return { shots, dropped };
}

function insideExpanded(p: Vec3, box: Box, margin: number): boolean {
  return p.every((v, axis) => v >= box.min[axis] - margin && v <= box.max[axis] + margin);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

function roundVec(v: Vec3): Vec3 {
  return [round(v[0]), round(v[1]), round(v[2])];
}

// ---------------------------------------------------------------------------------------------
// Neighbors. The model shows surrounding buildings from OpenStreetMap (project.json `context`).
// The compiler treats each as a box and rejects any shot whose view of the building they block.

/** A neighboring building as an axis-aligned box in model coordinates. */
export type Obstacle = { name: string; min: Vec3; max: Vec3 };

/** Same constants as the model builder (model-builder/src/model_builder/massing.py), so boxes line up. */
const METERS_PER_DEG_LNG_AT_EQUATOR = 111_320;
const METERS_PER_DEG_LAT = 110_574;
const CONTEXT_RADIUS_M = 220;
const CONTEXT_LEVEL_HEIGHT_M = 3.2;
const CONTEXT_DEFAULT_HEIGHT_M = 10;
/** Samples per keyframe segment when checking the view while the camera moves. */
const SIGHT_SAMPLES = 8;

type LngLat = [number, number];
type ContextItem = { footprint?: unknown; heightM?: unknown; levels?: unknown; name?: unknown };

/**
 * Turns project.json's `footprint` and `context` into obstacle boxes in model coordinates, using the
 * model builder's local frame (meters from the footprint's centroid, +X east, -Z north). Skips the
 * subject building and anything beyond the builder's context radius. Returns [] without context.
 */
export function obstaclesFromProject(raw: unknown, box: Box): Obstacle[] {
  const project = (raw ?? {}) as { footprint?: unknown; context?: unknown };
  const site = ring(project.footprint);
  if (!site || !Array.isArray(project.context)) return [];
  const toModel = localFrame(site);
  const obstacles: Obstacle[] = [];
  for (const item of project.context as ContextItem[]) {
    const footprint = ring(item?.footprint);
    if (!footprint) continue;
    const points = footprint.map(toModel);
    const xs = points.map((p) => p[0]);
    const zs = points.map((p) => p[1]);
    const min: Vec3 = [Math.min(...xs), 0, Math.min(...zs)];
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    // The subject building itself, or too far away to be in the model.
    if (cx > box.min[0] && cx < box.max[0] && cz > box.min[2] && cz < box.max[2]) continue;
    const dx = Math.max(box.min[0] - cx, 0, cx - box.max[0]);
    const dz = Math.max(box.min[2] - cz, 0, cz - box.max[2]);
    if (Math.hypot(dx, dz) > CONTEXT_RADIUS_M) continue;
    const height =
      positive(item.heightM) ?? (positive(item.levels) ? positive(item.levels)! * CONTEXT_LEVEL_HEIGHT_M : CONTEXT_DEFAULT_HEIGHT_M);
    obstacles.push({
      name: typeof item.name === "string" && item.name ? item.name : "a neighboring building",
      min,
      max: [Math.max(...xs), height, Math.max(...zs)],
    });
  }
  return obstacles;
}

/** Problems where a neighbor blocks the view or the camera sits inside one, along the whole move. */
function sightProblems(path: CameraPath, obstacles: Obstacle[]): string[] {
  if (obstacles.length === 0) return [];
  const problems = new Set<string>();
  const frames = path.keyframes;
  for (let i = 0; i < frames.length; i++) {
    const a = frames[i];
    const b = frames[Math.min(i + 1, frames.length - 1)];
    const samples = i === frames.length - 1 ? 1 : SIGHT_SAMPLES;
    for (let k = 0; k < samples; k++) {
      const s = k / SIGHT_SAMPLES;
      const camera = lerp(a.position, b.position, s);
      const target = lerp(a.target, b.target, s);
      // Stop just short of the target, which sits on the building's own face.
      const end = lerp(camera, target, 0.98);
      for (const o of obstacles) {
        if (inside(camera, o)) problems.add(`camera passes through ${o.name}`);
        else if (segmentHitsBox(camera, end, o)) problems.add(`${o.name} blocks the view after keyframe ${i}`);
      }
    }
  }
  return [...problems];
}

/** Slab test: does the segment a-b cross the box? */
export function segmentHitsBox(a: Vec3, b: Vec3, o: Pick<Obstacle, "min" | "max">): boolean {
  let t0 = 0;
  let t1 = 1;
  for (let axis = 0; axis < 3; axis++) {
    const d = b[axis] - a[axis];
    if (Math.abs(d) < 1e-9) {
      if (a[axis] < o.min[axis] || a[axis] > o.max[axis]) return false;
      continue;
    }
    let near = (o.min[axis] - a[axis]) / d;
    let far = (o.max[axis] - a[axis]) / d;
    if (near > far) [near, far] = [far, near];
    t0 = Math.max(t0, near);
    t1 = Math.min(t1, far);
    if (t0 > t1) return false;
  }
  return true;
}

function inside(p: Vec3, o: Obstacle): boolean {
  return p.every((v, axis) => v >= o.min[axis] && v <= o.max[axis]);
}

function lerp(a: Vec3, b: Vec3, s: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
}

function ring(value: unknown): LngLat[] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const points = value.filter(
    (p): p is LngLat => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]),
  );
  return points.length >= 3 ? points : null;
}

function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** The builder's frame: center on the site footprint's area centroid; returns [x east, z] with z = -north. */
function localFrame(site: LngLat[]): (p: LngLat) => [number, number] {
  const lng0 = site.reduce((sum, p) => sum + p[0], 0) / site.length;
  const lat0 = site.reduce((sum, p) => sum + p[1], 0) / site.length;
  const perLng = METERS_PER_DEG_LNG_AT_EQUATOR * Math.cos((lat0 * Math.PI) / 180);
  const raw = (p: LngLat): [number, number] => [(p[0] - lng0) * perLng, (p[1] - lat0) * METERS_PER_DEG_LAT];
  const [cx, cy] = centroid(site.map(raw));
  return (p) => {
    const [x, y] = raw(p);
    return [x - cx, -(y - cy)];
  };
}

/** Area centroid of a simple polygon (shoelace), as shapely computes it. */
function centroid(points: [number, number][]): [number, number] {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(area) < 1e-9) {
    return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
  }
  return [cx / (3 * area), cy / (3 * area)];
}
