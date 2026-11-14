import { z } from "zod";
import { buildingSides, type ModelInfo, type ModelMetadata } from "@/features/model/schema";
import { shotListSchema, type CameraKeyframe, type CameraPath, type Shot } from "@/features/shots/schema";

/*
 * Shot compiler: turns an LLM-chosen shot intent into a camera path.
 * The LLM never writes coordinates. This module is pure (no I/O) so it can be tested directly.
 *
 * Lives here, not in src/features/shots/, until the team lead approves new files there.
 */

type Box = ModelMetadata["boundingBox"];
type Vec3 = [number, number, number];
type Side = (typeof buildingSides)[number];

export const shotMoves = ["rise", "orbit", "push-in", "track", "reveal", "ground-hero"] as const;
export type ShotMove = (typeof shotMoves)[number];

/** What the LLM picks for each shot. Internal to generation, not a contract. */
export const shotIntentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  platform: z.enum(["drone", "ground"]),
  lens: z.string().min(1),
  timeOfDay: z.string().min(1),
  constructionPhase: z.string().min(1),
  side: z.enum(buildingSides),
  move: z.enum(shotMoves),
  /** Multiple of the building's largest dimension. */
  distance: z.number().min(1.2).max(4),
  /** Multiple of the building's height. */
  height: z.number().min(0).max(1.6),
  durationSec: z.number().min(4).max(10),
});
export type ShotIntent = z.infer<typeof shotIntentSchema>;

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
      keyframes = [
        { t: 0, position: f.offFace(d, lat, Math.max(f.y(0.05), 2)), target: f.onFace(0, f.y(0.3)) },
        { t: T * 0.55, position: f.offFace(d * 1.05, lat * 0.5, f.y(0.8)), target: f.onFace(0, f.y(0.5)) },
        { t: T, position: f.offFace(d * 1.1, 0, top), target: f.onFace(0, f.y(0.6)) },
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
      // Eye height, low angle up at the face, with a slow drift in.
      const lat = f.halfLateral * 0.1;
      keyframes = [
        { t: 0, position: f.offFace(d, -lat, EYE_HEIGHT), target: f.onFace(0, f.y(0.6)) },
        { t: T * 0.5, position: f.offFace(d * 0.9, 0, EYE_HEIGHT), target: f.onFace(0, f.y(0.65)) },
        { t: T, position: f.offFace(d * 0.8, lat, EYE_HEIGHT), target: f.onFace(0, f.y(0.7)) },
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
export function checkCameraPath(path: CameraPath, box: Box): string[] {
  const problems: string[] = [];
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
export function compileShot(intent: ShotIntent, model: Pick<ModelInfo, "boundingBox" | "knownSides">): CompileResult {
  if (!model.knownSides.includes(intent.side)) {
    return { ok: false, name: intent.name, reasons: [`side "${intent.side}" has no real reference`] };
  }
  let camera = compileCameraPath(intent, model.boundingBox);
  let reasons = checkCameraPath(camera, model.boundingBox);
  if (reasons.length > 0) {
    camera = compileCameraPath({ ...intent, distance: intent.distance * 1.25 }, model.boundingBox);
    reasons = checkCameraPath(camera, model.boundingBox);
    if (reasons.length > 0) return { ok: false, name: intent.name, reasons };
  }
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
): CompiledShotList {
  const kept: Omit<Shot, "id">[] = [];
  const dropped: CompiledShotList["dropped"] = [];
  for (const intent of intents) {
    const result = compileShot(intent, model);
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
