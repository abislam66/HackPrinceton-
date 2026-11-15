import { Box3, BoxGeometry, BufferGeometry, CylinderGeometry, ExtrudeGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Shape, Vector2 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { z } from "zod";
import type { ModelObstacle } from "./schema";

/*
 * A generated building as data: the contract between the building viewer's model call and the server that turns it
 * into a GLB. Claude researches the building and returns this JSON; trusted code here builds the three.js scene. No
 * model-written code runs anywhere.
 *
 * Coordinates: metres, +Y up, +X east, -Z north, origin at the centre of the building's footprint at ground level
 * (the same frame as model.json). Each part's `at` is the centre of its base: x, base height, z.
 *
 * Materials carry the house look's toon parameters (building-viewer/scaffold.html's toonMaterial). The GLB keeps them
 * in each material's extras (`userData.toon`), and the viewers rebuild the toon shader from them. The plain colour
 * is the light colour, so any other GLB viewer still shows something sensible.
 */

export const MAX_MATERIALS = 6;
export const MAX_PARTS = 300;
/** Meshes after repeats. Keeps the GLB small and the scene quick to draw. */
export const MAX_MESHES = 800;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "a colour like #7E9CAB");
const metres = (max: number) => z.number().finite().min(0.05).max(max);
const coord = z.number().finite().min(-1000).max(1000);
const vec3 = z.tuple([coord, coord, coord]);

export const sceneMaterialSchema = z.object({
  /** "curtain" draws floor lines, mullions and bands; "toon" is a flat two-tone surface. */
  type: z.enum(["toon", "curtain"]).default("toon"),
  light: hex,
  shade: hex,
  line: hex.optional(),
  band: hex.optional(),
  line_shade: hex.optional(),
  band_shade: hex.optional(),
  floor_h: z.number().finite().min(1).max(20).optional(),
  line_w: z.number().finite().min(0).max(5).optional(),
  mull: z.number().finite().min(0.3).max(30).optional(),
  mull_w: z.number().finite().min(0).max(5).optional(),
  major_n: z.number().int().min(1).max(50).optional(),
  band_w: z.number().finite().min(0).max(10).optional(),
  z0: z.number().finite().min(-50).max(1000).optional(),
  /** Skip this material's outlines (glass fins, railings). */
  nolines: z.boolean().optional(),
});
export type SceneMaterial = z.infer<typeof sceneMaterialSchema>;

const partBase = {
  mat: z.string(),
  at: vec3,
  /** Turn about the vertical axis, in degrees. */
  rotY: z.number().finite().min(-360).max(360).optional(),
  /** Where the part's size and position come from. */
  basis: z.enum(["observed", "inferred"]),
  note: z.string().max(200).optional(),
  /** Copies of the part, each `step` further on (fins, balconies, repeated bays). */
  repeat: z.object({ count: z.number().int().min(1).max(200), step: vec3 }).optional(),
};

export const scenePartSchema = z.discriminatedUnion("shape", [
  z.object({ shape: z.literal("box"), size: z.tuple([metres(1000), metres(1000), metres(1000)]), ...partBase }),
  z.object({
    shape: z.literal("cylinder"),
    radius: metres(500),
    /** For a taper. Defaults to radius. */
    radiusTop: z.number().finite().min(0).max(500).optional(),
    height: metres(1000),
    sides: z.number().int().min(3).max(64).optional(),
    ...partBase,
  }),
  z.object({
    shape: z.literal("prism"),
    /** The outline as [x, z] points around `at`, in order. Extruded straight up by `height`. */
    footprint: z.array(z.tuple([coord, coord])).min(3).max(64),
    height: metres(1000),
    ...partBase,
  }),
]);
export type ScenePart = z.infer<typeof scenePartSchema>;

export const sceneSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    materials: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,23}$/, "lowercase names like glass or podium"), sceneMaterialSchema),
    parts: z.array(scenePartSchema).min(1).max(MAX_PARTS),
  })
  .superRefine((scene, ctx) => {
    const names = Object.keys(scene.materials);
    if (names.length < 1 || names.length > MAX_MATERIALS) {
      ctx.addIssue({ code: "custom", path: ["materials"], message: `use 1 to ${MAX_MATERIALS} materials, not ${names.length}` });
    }
    let meshes = 0;
    scene.parts.forEach((part, i) => {
      if (!(part.mat in scene.materials)) {
        ctx.addIssue({ code: "custom", path: ["parts", i, "mat"], message: `"${part.mat}" is not in materials` });
      }
      meshes += part.repeat?.count ?? 1;
    });
    if (meshes > MAX_MESHES) {
      ctx.addIssue({ code: "custom", path: ["parts"], message: `${meshes} meshes after repeats; keep it under ${MAX_MESHES}` });
    }
  });
export type BuildingScene = z.infer<typeof sceneSchema>;

/** Toon parameters as the shader reads them, with the scaffold's defaults filled in. */
export type ToonParams = {
  type: "toon" | "curtain";
  light: string;
  shade: string;
  line: string;
  band: string;
  line_shade: string;
  band_shade: string;
  floor_h: number;
  line_w: number;
  mull: number;
  mull_w: number;
  major_n: number;
  band_w: number;
  z0: number;
  nolines: boolean;
};

/** The scaffold's locked palette for the neighbours and the ground. */
export const CONTEXT_TOON: ToonParams = toonParams({ type: "toon", light: "#D9D3C7", shade: "#A59C93" });
export const GROUND_TOON: ToonParams = CONTEXT_TOON;
/** Streets: a step darker than the ground, flat, no outlines. */
export const STREET_TOON: ToonParams = toonParams({ type: "toon", light: "#BDB5A8", shade: "#958C82", nolines: true });

export function toonParams(m: SceneMaterial): ToonParams {
  const line = m.line ?? m.shade;
  const band = m.band ?? "#1b1d33";
  return {
    type: m.type ?? "toon",
    light: m.light,
    shade: m.shade,
    line,
    band,
    line_shade: m.line_shade ?? line,
    band_shade: m.band_shade ?? band,
    floor_h: m.floor_h ?? 4,
    line_w: m.line_w ?? 0.35,
    mull: m.mull ?? 3,
    mull_w: m.mull_w ?? 0.2,
    major_n: m.major_n ?? 3,
    band_w: m.band_w ?? 0.7,
    z0: m.z0 ?? 0,
    nolines: m.nolines ?? false,
  };
}

/** A neighbouring building, in the subject's frame (from geo.ts's OpenStreetMap context). */
export type SceneNeighbour = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** The real outline as [x, z] points, when known. Otherwise a w x d box at x, z. */
  footprint?: [number, number][];
  source: string;
};

/** A street centreline as [x, z] points in the subject's frame (from geo.ts), drawn as a flat strip. */
export type SceneStreet = { line: [number, number][]; widthM: number };

export type Obstacle = ModelObstacle;

export type BuiltScene = {
  /** subject (the building) and context (its neighbours), ready to export. */
  root: Group;
  /** The subject only, in metres: what model.json's boundingBox and the shot compiler use. */
  boundingBox: { min: [number, number, number]; max: [number, number, number] };
  /** The neighbours as boxes, for the shot compiler. */
  obstacles: Obstacle[];
};

const DEG = Math.PI / 180;

function partGeometry(part: ScenePart): { geometry: BufferGeometry; lift: number } {
  switch (part.shape) {
    case "box":
      return { geometry: new BoxGeometry(part.size[0], part.size[1], part.size[2]), lift: part.size[1] / 2 };
    case "cylinder":
      return {
        geometry: new CylinderGeometry(part.radiusTop ?? part.radius, part.radius, part.height, part.sides ?? 24),
        lift: part.height / 2,
      };
    case "prism":
      return { geometry: prism(part.footprint, part.height), lift: 0 };
  }
}

/** An outline of [x, z] points extruded up by `height`, base at y = 0. */
function prism(footprint: [number, number][], height: number): BufferGeometry {
  // The shape is drawn in x/y and turned to lie flat: rotateX(-90°) sends shape y to -z, so y = -z.
  const shape = new Shape(footprint.map(([x, z]) => new Vector2(x, -z)));
  const geometry = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function toonStandIn(name: string, params: ToonParams): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: params.light, roughness: 0.9, metalness: 0, name });
  material.userData.toon = params;
  return material;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Builds the subject from the scene and adds the neighbours, then moves everything so the subject's footprint is
 * centred on the origin with its base at y = 0. Pure: no DOM, so it runs on the server.
 */
export function buildScene(scene: BuildingScene, neighbours: SceneNeighbour[] = [], streets: SceneStreet[] = []): BuiltScene {
  const materials = new Map(Object.entries(scene.materials).map(([name, m]) => [name, toonStandIn(name, toonParams(m))]));

  const subject = new Group();
  subject.name = "subject";
  scene.parts.forEach((part, i) => {
    const material = materials.get(part.mat)!;
    const count = part.repeat?.count ?? 1;
    const step = part.repeat?.step ?? [0, 0, 0];
    const { geometry, lift } = partGeometry(part);
    for (let k = 0; k < count; k++) {
      // One geometry for every copy: the GLB stores it once.
      const mesh = new Mesh(geometry, material);
      mesh.name = `${part.mat}-${i}${count > 1 ? `-${k}` : ""}`;
      mesh.position.set(part.at[0] + step[0] * k, part.at[1] + step[1] * k + lift, part.at[2] + step[2] * k);
      mesh.rotation.y = (part.rotY ?? 0) * DEG;
      subject.add(mesh);
    }
  });

  subject.updateMatrixWorld(true);
  const box = new Box3().setFromObject(subject);
  if (box.isEmpty()) throw new Error("The scene has no geometry.");
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const base = box.min.y;

  const root = new Group();
  root.name = "model";
  subject.position.set(-cx, -base, -cz);
  root.add(subject);

  const half = { x: (box.max.x - box.min.x) / 2, z: (box.max.z - box.min.z) / 2 };
  const contextMaterial = toonStandIn("context", CONTEXT_TOON);
  const context = new Group();
  context.name = "context";
  const obstacles: Obstacle[] = [];
  neighbours.forEach((n, i) => {
    // Moved with the subject, so neighbours keep their place relative to it.
    const x = n.x - cx;
    const z = n.z - cz;
    // A neighbour whose centre is inside the subject's footprint, or that lies mostly inside it, is the subject's own
    // site (its OSM outline, a podium, a wing), not a neighbour.
    if (Math.abs(x) < half.x && Math.abs(z) < half.z) return;
    const overlapX = Math.max(0, Math.min(x + n.w / 2, half.x) - Math.max(x - n.w / 2, -half.x));
    const overlapZ = Math.max(0, Math.min(z + n.d / 2, half.z) - Math.max(z - n.d / 2, -half.z));
    if (overlapX * overlapZ > 0.5 * n.w * n.d) return;
    const geometry = n.footprint && n.footprint.length >= 3 ? prism(n.footprint.map(([px, pz]) => [px - n.x, pz - n.z]), n.h) : new BoxGeometry(n.w, n.h, n.d);
    const mesh = new Mesh(geometry, contextMaterial);
    mesh.name = `context-${i}`;
    mesh.position.set(x, n.footprint && n.footprint.length >= 3 ? 0 : n.h / 2, z);
    context.add(mesh);
    obstacles.push({
      name: n.source,
      min: [round(x - n.w / 2), 0, round(z - n.d / 2)],
      max: [round(x + n.w / 2), round(n.h), round(z + n.d / 2)],
    });
  });
  if (context.children.length) root.add(context);

  // Streets: one flat box per segment, merged into a single mesh. Not obstacles: drones may fly over them.
  const strips: BufferGeometry[] = [];
  for (const street of streets) {
    for (let i = 1; i < street.line.length; i++) {
      const [x0, z0] = street.line[i - 1];
      const [x1, z1] = street.line[i];
      const length = Math.hypot(x1 - x0, z1 - z0);
      if (length < 0.5) continue;
      const strip = new BoxGeometry(length + street.widthM * 0.5, 0.04, street.widthM);
      strip.applyMatrix4(
        new Matrix4().makeRotationY(-Math.atan2(z1 - z0, x1 - x0)).setPosition((x0 + x1) / 2 - cx, 0.02, (z0 + z1) / 2 - cz),
      );
      strips.push(strip.toNonIndexed());
    }
  }
  if (strips.length) {
    const merged = mergeGeometries(strips);
    if (merged) {
      const mesh = new Mesh(merged, toonStandIn("street", STREET_TOON));
      mesh.name = "streets-street";
      root.add(mesh);
    }
  }

  root.updateMatrixWorld(true);
  const subjectBox = new Box3().setFromObject(subject);
  return {
    root,
    boundingBox: {
      min: [round(subjectBox.min.x), round(subjectBox.min.y), round(subjectBox.min.z)],
      max: [round(subjectBox.max.x), round(subjectBox.max.y), round(subjectBox.max.z)],
    },
    obstacles,
  };
}
