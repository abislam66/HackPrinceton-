import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTEXT_TOON } from "@/features/model/scene";
import {
  FILLER_CELL_M,
  FILLER_CLEAR_M,
  FILLER_GAP_M,
  FILLER_OUTER_M,
  FILLER_SEED,
  FOOTPRINT_CELL_M,
  fillerBlocks,
  footprintOf,
  type FillerBlock,
  type Footprint,
  type GroundTriangle,
} from "./filler";
import { FILLER_TOON } from "./house-look";

const scaffold = readFileSync(path.join(process.cwd(), "building-viewer", "scaffold.html"), "utf8");

/** The scaffold's own copy of the generator, run as the page runs it. */
function scaffoldFiller() {
  const start = scaffold.indexOf("const FILLER = ");
  const end = scaffold.indexOf("function groundTriangles(");
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return new Function(`${scaffold.slice(start, end)}\nreturn { fillerBlocks, footprintOf };`)() as {
    fillerBlocks: (fp: Footprint | null, seed: number) => FillerBlock[];
    footprintOf: (tris: GroundTriangle[]) => Footprint | null;
  };
}

/** A rectangle from above, as two triangles. */
function rect(x0: number, z0: number, x1: number, z1: number): GroundTriangle[] {
  return [
    [x0, z0, x1, z0, x1, z1],
    [x0, z0, x1, z1, x0, z1],
  ];
}

// The subject, a street running 600 m east out of the context circle, and a big neighbour across the circle's edge.
const STREET = { x0: 0, z0: 24, x1: 600, z1: 36 }; // off the filler grid's own street lines (multiples of 64)
const BIG = { x0: -60, z0: -320, x1: 60, z1: -200 };
const triangles = [
  ...rect(-20, -20, 20, 20),
  ...rect(STREET.x0, STREET.z0, STREET.x1, STREET.z1),
  ...rect(BIG.x0, BIG.z0, BIG.x1, BIG.z1),
];

/** Gap between a block and a rectangle, metres (0 when they overlap). */
function gapTo(b: FillerBlock, r: { x0: number; z0: number; x1: number; z1: number }): number {
  const dx = Math.max(r.x0 - (b.x + b.w / 2), b.x - b.w / 2 - r.x1, 0);
  const dz = Math.max(r.z0 - (b.z + b.d / 2), b.z - b.d / 2 - r.z1, 0);
  return Math.hypot(dx, dz);
}

function nearEdge(b: FillerBlock): number {
  return Math.hypot(Math.max(Math.abs(b.x) - b.w / 2, 0), Math.max(Math.abs(b.z) - b.d / 2, 0));
}

describe("filler town", () => {
  const footprint = footprintOf(triangles);
  const blocks = fillerBlocks(footprint, FILLER_SEED);

  it("is the same town every time", () => {
    expect(fillerBlocks(footprintOf(triangles), FILLER_SEED)).toEqual(blocks);
  });

  it("matches the standalone viewer's copy block for block", () => {
    const page = scaffoldFiller();
    expect(page.footprintOf(triangles)).toEqual(footprint);
    expect(page.fillerBlocks(footprint, FILLER_SEED)).toEqual(blocks);
    expect(page.fillerBlocks(null, FILLER_SEED)).toEqual(fillerBlocks(null, FILLER_SEED));
    expect(scaffold).toContain(`const FILLER_SEED = 0x${FILLER_SEED.toString(16)};`);
    expect(scaffold).toContain(`const FILLER_MATERIAL = { light: "${FILLER_TOON.light}", shade: "${FILLER_TOON.shade}" };`);
    expect(scaffold).toContain(`const FILLER = { cell: ${FILLER_CELL_M}, street: 14, outer: ${FILLER_OUTER_M}, gap: ${FILLER_GAP_M} };`);
    expect(scaffold).toContain(`const FOOTPRINT_CELL = ${FOOTPRINT_CELL_M}, FILLER_CLEAR = 220 + FILLER.gap;`);
  });

  it("is a town, not a scatter: thousands of blocks, mostly low", () => {
    expect(blocks.length).toBeGreaterThan(10000);
    expect(blocks.length).toBeLessThan(80000);
    const low = blocks.filter((b) => b.h <= 23).length;
    expect(low / blocks.length).toBeGreaterThan(0.9);
    expect(blocks.reduce((m, b) => Math.max(m, b.h), 0)).toBeLessThanOrEqual(60);
  });

  it("leaves the real context's circle to the real context, and stops at the outer ring", () => {
    for (const b of blocks) {
      expect(nearEdge(b)).toBeGreaterThanOrEqual(FILLER_CLEAR_M);
      expect(Math.hypot(b.x, b.z)).toBeLessThanOrEqual(FILLER_OUTER_M);
    }
  });

  it("steps around real geometry that reaches past the circle", () => {
    // A cell's worth of slack: the footprint is a grid.
    for (const b of blocks) {
      expect(gapTo(b, STREET)).toBeGreaterThan(FILLER_GAP_M - FOOTPRINT_CELL_M);
      expect(gapTo(b, BIG)).toBeGreaterThan(FILLER_GAP_M - FOOTPRINT_CELL_M);
    }
    // Without the footprint the street's line would be built over.
    expect(fillerBlocks(null, FILLER_SEED).some((b) => gapTo(b, STREET) === 0)).toBe(true);
  });

  it("runs right up to the circle where nothing real reaches past it: no empty ring", () => {
    const west = blocks.filter((b) => b.x < -FILLER_CLEAR_M && Math.abs(b.z) < 150);
    expect(west.some((b) => nearEdge(b) < FILLER_CLEAR_M + FILLER_CELL_M)).toBe(true);
  });

  it("keeps blocks apart: no two overlap", () => {
    const byCell = new Map<string, FillerBlock[]>();
    for (const b of blocks) {
      const key = `${Math.floor(b.x / FILLER_CELL_M)},${Math.floor(b.z / FILLER_CELL_M)}`;
      byCell.set(key, [...(byCell.get(key) ?? []), b]);
    }
    for (const group of byCell.values()) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i];
          const b = group[j];
          const apart = Math.abs(a.x - b.x) >= (a.w + b.w) / 2 - 1e-9 || Math.abs(a.z - b.z) >= (a.d + b.d) / 2 - 1e-9;
          expect(apart).toBe(true);
        }
      }
    }
  });

  it("marks only what triangles cover from above: walls (edge-on) cover nothing", () => {
    const wall: GroundTriangle = [0, 0, 50, 0, 50, 0];
    expect(footprintOf([wall])?.filled.every((v) => v === 0)).toBe(true);
    expect(footprintOf([])).toBeNull();
  });

  it("has roofs that stand out from the ground when seen from above", () => {
    expect(FILLER_TOON.light).not.toBe(CONTEXT_TOON.light);
  });
});
