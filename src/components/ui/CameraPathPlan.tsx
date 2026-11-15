import type { CameraKeyframe } from "@/features/shots/schema";

/** A plan footprint in model coordinates: x east, z south (-Z is north). */
export type PlanBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

type Pt = [number, number];

const PLAN_W = 72;
const PLAN_H = 48;
const PLAN_PAD = 5;
const ARROW_LENGTH = 4.5;
const ARROW_HALF = 2.5;

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The footprint every plan in a list shares: the bounds of every keyframe target across the shots. Use it until the
 * model's own bounding box is wired in. Pass the whole shot list, so the plans compare.
 */
export function planFootprint(shots: readonly { camera: { keyframes: readonly CameraKeyframe[] } }[]): PlanBounds {
  const xs = shots.flatMap((s) => s.camera.keyframes.map((k) => k.target[0]));
  const zs = shots.flatMap((s) => s.camera.keyframes.map((k) => k.target[2]));
  if (xs.length === 0) return { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/**
 * Top-down plan of one shot, north up. Model coordinates are +X east and -Z north, so x maps to the box's x and z
 * maps straight to its y (south is down). The view fits the footprint plus this shot's camera positions and its
 * last aim point, with one uniform scale so the building keeps its proportions.
 */
function planOf(keys: readonly CameraKeyframe[], footprint: PlanBounds) {
  const last = keys[keys.length - 1];
  const positions: Pt[] = keys.map((k) => [k.position[0], k.position[2]]);
  const aim: Pt = [last.target[0], last.target[2]];

  const xs = [footprint.minX, footprint.maxX, aim[0], ...positions.map((p) => p[0])];
  const zs = [footprint.minZ, footprint.maxZ, aim[1], ...positions.map((p) => p[1])];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const scale = Math.min((PLAN_W - 2 * PLAN_PAD) / Math.max(maxX - minX, 1), (PLAN_H - 2 * PLAN_PAD) / Math.max(maxZ - minZ, 1));
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const project = ([x, z]: Pt): Pt => [PLAN_W / 2 + (x - cx) * scale, PLAN_H / 2 + (z - cz) * scale];

  const path = positions.map(project);
  const end = path[path.length - 1];
  // Direction of travel at the end: back to the last point that is visibly apart from it.
  const before = [...path].reverse().find((p) => Math.hypot(end[0] - p[0], end[1] - p[1]) > 0.5);
  let arrow: string | null = null;
  let line = path;
  if (before) {
    const len = Math.hypot(end[0] - before[0], end[1] - before[1]);
    const d: Pt = [(end[0] - before[0]) / len, (end[1] - before[1]) / len];
    const base: Pt = [end[0] - d[0] * ARROW_LENGTH, end[1] - d[1] * ARROW_LENGTH];
    const n: Pt = [-d[1] * ARROW_HALF, d[0] * ARROW_HALF];
    arrow = [end, [base[0] + n[0], base[1] + n[1]], [base[0] - n[0], base[1] - n[1]]]
      .map(([x, y]) => `${r2(x)},${r2(y)}`)
      .join(" ");
    // Stop the 1.5 px line at the arrow's base so it doesn't blunt the tip.
    if (len > ARROW_LENGTH) line = [...path.slice(0, -1), base];
  }

  const [fx, fy] = project([footprint.minX, footprint.minZ]);
  return {
    footprint: {
      x: Math.round(fx) + 0.5,
      y: Math.round(fy) + 0.5,
      w: Math.max(1, Math.round((footprint.maxX - footprint.minX) * scale)),
      h: Math.max(1, Math.round((footprint.maxZ - footprint.minZ) * scale)),
    },
    line: line.map(([x, y]) => `${r2(x)},${r2(y)}`).join(" "),
    // A move too short to show at this scale (a pure rise) keeps its arrow but drops the start dot it would cover.
    start: !arrow || Math.hypot(end[0] - path[0][0], end[1] - path[0][1]) > ARROW_LENGTH + 2 ? (path[0].map(r2) as Pt) : null,
    end: end.map(r2) as Pt,
    aim: project(aim).map(r2) as Pt,
    arrow,
  };
}

export type CameraPathPlanProps = {
  /** The shot's camera keyframes, in model coordinates. */
  keyframes: readonly CameraKeyframe[];
  /** The footprint shared by every plan in the list: `planFootprint(shots)`. */
  footprint: PlanBounds;
  className?: string;
};

/**
 * A 72×48 top-down plan of a shot's camera path: the footprint, a 1.5 px path with a start dot and an end arrow, and
 * a dashed line to the last aim point. The path turns Cone in a selected row. Decorative: the row names the shot.
 * Known limit: a shot that is mostly a vertical rise draws little more than an arrow.
 */
export function CameraPathPlan({ keyframes, footprint, className }: CameraPathPlanProps) {
  const plan = planOf(keyframes, footprint);
  return (
    <svg
      className={className ? `app-plan ${className}` : "app-plan"}
      width={PLAN_W}
      height={PLAN_H}
      viewBox={`0 0 ${PLAN_W} ${PLAN_H}`}
      aria-hidden="true"
    >
      <line className="app-plan-aim" x1={plan.end[0]} y1={plan.end[1]} x2={plan.aim[0]} y2={plan.aim[1]} />
      <rect className="app-plan-footprint" x={plan.footprint.x} y={plan.footprint.y} width={plan.footprint.w} height={plan.footprint.h} />
      <polyline className="app-plan-path" points={plan.line} />
      {plan.start ? <circle className="app-plan-start" cx={plan.start[0]} cy={plan.start[1]} r={1.75} /> : null}
      {plan.arrow ? <polygon className="app-plan-arrow" points={plan.arrow} /> : null}
    </svg>
  );
}
