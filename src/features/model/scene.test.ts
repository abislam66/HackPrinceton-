import { describe, expect, it, vi } from "vitest";
import type { Mesh, MeshStandardMaterial } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

vi.mock("server-only", () => ({}));

import { glbBoundingBox, readGlbJson } from "./glb-bounds";
import { buildScene, sceneSchema, type BuildingScene, type SceneNeighbour } from "./scene";
import { exportGlb } from "./scene-glb";

/** A tower on a podium with a finned crown, like the scenes Claude returns. */
const TOWER: BuildingScene = sceneSchema.parse({
  title: "Test tower",
  materials: {
    glass: { type: "curtain", light: "#7E9CAB", shade: "#4A6070", line: "#2A3442", band: "#1b1d33", floor_h: 3.4 },
    podium: { type: "toon", light: "#F4F1EA", shade: "#A59C93" },
    fins: { light: "#E8B730", shade: "#A88420", nolines: true },
  },
  parts: [
    { shape: "box", size: [32, 18, 26], at: [0, 0, 0], mat: "podium", basis: "inferred" },
    { shape: "box", size: [28, 200, 22], at: [0, 18, 0], mat: "glass", basis: "observed", note: "64 floors" },
    { shape: "box", size: [0.6, 20, 1.2], at: [-12, 218, 11], mat: "fins", basis: "inferred", repeat: { count: 9, step: [3, 0, 0] } },
    { shape: "cylinder", radius: 3, height: 6, at: [0, 218, 0], mat: "podium", basis: "inferred" },
    { shape: "prism", footprint: [[-5, -5], [5, -5], [5, 5], [-5, 5]], height: 2, at: [0, 224, 0], mat: "podium", basis: "inferred" },
  ],
});

const NEIGHBOURS: SceneNeighbour[] = [
  { x: 60, z: 0, w: 20, d: 30, h: 40, source: "OpenStreetMap way 1", footprint: [[50, -15], [70, -15], [70, 15], [50, 15]] },
  { x: 0, z: -80, w: 25, d: 25, h: 12, source: "OpenStreetMap way 2" },
  // Inside the subject's footprint: part of its own site, dropped.
  { x: 2, z: 1, w: 10, d: 10, h: 30, source: "OpenStreetMap way 3" },
];

async function load(glb: Uint8Array) {
  const buffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
  return new GLTFLoader().parseAsync(buffer, "");
}

describe("sceneSchema", () => {
  it("rejects a part whose material is not defined", () => {
    const bad = sceneSchema.safeParse({ ...TOWER, parts: [{ ...TOWER.parts[0], mat: "steel" }] });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toContain('"steel" is not in materials');
  });

  it("rejects more than six materials, bad colours and too many meshes", () => {
    const seven = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`m${i}`, { light: "#ffffff", shade: "#000000" }]));
    expect(sceneSchema.safeParse({ ...TOWER, materials: seven, parts: [{ ...TOWER.parts[0], mat: "m0" }] }).success).toBe(false);
    expect(sceneSchema.safeParse({ ...TOWER, materials: { podium: { light: "white", shade: "#000000" } } }).success).toBe(false);
    const many = Array.from({ length: 5 }, () => ({ ...TOWER.parts[0], repeat: { count: 200, step: [1, 0, 0] } }));
    expect(sceneSchema.safeParse({ ...TOWER, parts: many }).success).toBe(false);
  });
});

describe("buildScene", () => {
  it("centres the subject on the origin with its base at y = 0, and measures only the subject", () => {
    const shifted = sceneSchema.parse({ ...TOWER, parts: TOWER.parts.map((p) => ({ ...p, at: [p.at[0] + 10, p.at[1] + 2, p.at[2] - 4] })) });
    const { boundingBox } = buildScene(shifted, NEIGHBOURS);
    expect(boundingBox.min[1]).toBeCloseTo(0, 3);
    expect(boundingBox.max[1]).toBeCloseTo(238, 3); // the crown fins: base 218 + 20
    expect(boundingBox.min[0] + boundingBox.max[0]).toBeCloseTo(0, 3);
    expect(boundingBox.min[2] + boundingBox.max[2]).toBeCloseTo(0, 3);
  });

  it("adds neighbours as context meshes and obstacles, skipping one inside the subject", () => {
    const { root, obstacles } = buildScene(TOWER, NEIGHBOURS);
    const context = root.getObjectByName("context");
    expect(context?.children.map((c) => c.name)).toEqual(["context-0", "context-1"]);
    expect(obstacles.map((o) => o.name)).toEqual(["OpenStreetMap way 1", "OpenStreetMap way 2"]);
    expect(obstacles[0].max[1]).toBe(40);
  });

  it("draws repeats as separate meshes", () => {
    const { root } = buildScene(TOWER);
    const fins = root.getObjectByName("subject")!.children.filter((c) => c.name.startsWith("fins-2-"));
    expect(fins).toHaveLength(9);
    expect(fins[8].position.x - fins[0].position.x).toBeCloseTo(24, 5);
  });
});

describe("streets", () => {
  it("draws streets as one flat mesh in the street colours, not as obstacles", () => {
    const streets = [{ line: [[-100, 40], [0, 40], [100, 60]] as [number, number][], widthM: 12 }];
    const { root, obstacles } = buildScene(TOWER, [], streets);
    const mesh = root.getObjectByName("streets-street") as Mesh;
    expect(mesh).toBeDefined();
    expect((mesh.material as MeshStandardMaterial).userData.toon).toMatchObject({ light: "#BDB5A8", nolines: true });
    mesh.geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox!.max.y).toBeLessThan(0.1);
    expect(obstacles).toEqual([]);
  });
});

describe("exportGlb", () => {
  it("writes a glTF 2 GLB whose bounds cover the subject and its neighbours", async () => {
    const built = buildScene(TOWER, NEIGHBOURS);
    const glb = await exportGlb(built.root);
    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(8, true)).toBe(glb.length);
    const all = glbBoundingBox(glb);
    expect(all.max[0]).toBeGreaterThan(built.boundingBox.max[0]); // the neighbour 60 m east is in the file
    expect(readGlbJson(glb).nodes?.some((n) => (n as { name?: string }).name === "subject")).toBe(true);
  });

  it("keeps each material's toon parameters in its extras, so viewers can rebuild the look", async () => {
    const glb = await exportGlb(buildScene(TOWER, NEIGHBOURS).root);
    const gltf = await load(glb);
    const byName = new Map<string, MeshStandardMaterial>();
    gltf.scene.traverse((o) => {
      const material = (o as Mesh).material as MeshStandardMaterial | undefined;
      if (material) byName.set(material.name, material);
    });
    expect(byName.get("glass")?.userData.toon).toMatchObject({ type: "curtain", light: "#7E9CAB", shade: "#4A6070", floor_h: 3.4 });
    expect(byName.get("fins")?.userData.toon).toMatchObject({ nolines: true });
    expect(byName.get("context")?.userData.toon).toMatchObject({ light: "#D9D3C7", shade: "#A59C93" });
    expect(`#${byName.get("podium")?.color.getHexString()}`.toLowerCase()).not.toBe("#ffffff");
  });
});
