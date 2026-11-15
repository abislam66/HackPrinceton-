import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GlbError, glbBoundingBox } from "./glb-bounds";
import { modelMetadataSchema } from "./schema";

/** A minimal GLB: a JSON chunk only (the reader never touches the binary chunk). */
function glb(json: object): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20);
  padded.set(text);
  const out = new Uint8Array(12 + 8 + padded.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, padded.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(padded, 20);
  return out;
}

const box = (min: number[], max: number[]) => ({ min, max });

describe("glbBoundingBox", () => {
  it("reads a mesh's POSITION min and max", () => {
    const bytes = glb({
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [box([-10, 0, -15], [10, 90, 15])],
    });
    expect(glbBoundingBox(bytes)).toEqual({ min: [-10, 0, -15], max: [10, 90, 15] });
  });

  it("carries node translation and scale into the box, and unions every mesh", () => {
    const bytes = glb({
      scenes: [{ nodes: [0] }],
      nodes: [{ children: [1, 2], translation: [100, 0, 0] }, { mesh: 0, scale: [2, 2, 2] }, { mesh: 0, translation: [0, 50, 0] }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [box([0, 0, 0], [5, 10, 5])],
    });
    // Child 1: x 100..110, y 0..20. Child 2: y 50..60. Union: y 0..60.
    expect(glbBoundingBox(bytes)).toEqual({ min: [100, 0, 0], max: [110, 60, 10] });
  });

  it("rejects bytes that are not a GLB, and a GLB with no positioned mesh", () => {
    expect(() => glbBoundingBox(new TextEncoder().encode("not a glb, just some text bytes"))).toThrow(GlbError);
    expect(() => glbBoundingBox(glb({ scenes: [{ nodes: [0] }], nodes: [{}] }))).toThrow(/no mesh/);
  });

  it("survives a node loop in a broken file", () => {
    const bytes = glb({
      scenes: [{ nodes: [0] }],
      nodes: [{ children: [1], mesh: 0 }, { children: [0] }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [box([0, 0, 0], [1, 1, 1])],
    });
    expect(glbBoundingBox(bytes).max).toEqual([1, 1, 1]);
  });

  it("covers the demo model's box (the GLB also holds neighbors and streets, which model.json leaves out)", () => {
    const dir = path.join(process.cwd(), "public", "models", "demo-project");
    const meta = modelMetadataSchema.parse(JSON.parse(readFileSync(path.join(dir, "model.json"), "utf8")));
    const found = glbBoundingBox(new Uint8Array(readFileSync(path.join(dir, "model.glb"))));
    meta.boundingBox.min.forEach((v, i) => expect(found.min[i]).toBeLessThanOrEqual(v + 0.01));
    meta.boundingBox.max.forEach((v, i) => expect(found.max[i]).toBeGreaterThanOrEqual(v - 0.01));
    expect(found.min[1]).toBeCloseTo(0, 1); // same ground as every generated model
  });
});
