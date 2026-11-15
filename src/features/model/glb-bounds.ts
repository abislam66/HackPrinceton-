import { Box3, Matrix4, Quaternion, Vector3 } from "three";

/*
 * The bounding box of a binary glTF (GLB), read from its JSON chunk: each mesh's POSITION accessor min/max
 * (required by the glTF spec), carried through the node hierarchy's transforms. No DOM, no loader, so it runs
 * on the server against an uploaded file. Pure function.
 */

const MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"

type GltfNode = { mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] };
type Gltf = {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: { primitives?: { attributes?: { POSITION?: number } }[] }[];
  accessors?: { min?: number[]; max?: number[] }[];
};

export class GlbError extends Error {}

/** The glTF JSON inside a GLB. Throws GlbError when the bytes are not a version 2 GLB. */
export function readGlbJson(bytes: Uint8Array): Gltf {
  if (bytes.length < 20) throw new GlbError("The file is too small to be a GLB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== 2) throw new GlbError("The file is not a glTF 2 GLB.");
  if (view.getUint32(8, true) !== bytes.length) throw new GlbError("The GLB length header does not match the file.");
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JSON_CHUNK || 20 + jsonLength > bytes.length) throw new GlbError("The GLB has no JSON chunk.");
  try {
    return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as Gltf;
  } catch {
    throw new GlbError("The GLB's JSON chunk does not parse.");
  }
}

function localMatrix(node: GltfNode): Matrix4 {
  if (node.matrix?.length === 16) return new Matrix4().fromArray(node.matrix);
  const t = node.translation ?? [0, 0, 0];
  const r = node.rotation ?? [0, 0, 0, 1];
  const s = node.scale ?? [1, 1, 1];
  return new Matrix4().compose(new Vector3(t[0], t[1], t[2]), new Quaternion(r[0], r[1], r[2], r[3]), new Vector3(s[0], s[1], s[2]));
}

/** min/max over every mesh in the default scene, in metres. Throws GlbError when the GLB has no positioned mesh. */
export function glbBoundingBox(bytes: Uint8Array): { min: [number, number, number]; max: [number, number, number] } {
  const gltf = readGlbJson(bytes);
  const nodes = gltf.nodes ?? [];
  const roots = gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? nodes.map((_, i) => i);
  const box = new Box3();
  const visited = new Set<number>();

  const visit = (index: number, parent: Matrix4) => {
    if (visited.has(index) || !nodes[index]) return; // a broken file can loop; visit each node once
    visited.add(index);
    const node = nodes[index];
    const world = parent.clone().multiply(localMatrix(node));
    for (const primitive of node.mesh !== undefined ? gltf.meshes?.[node.mesh]?.primitives ?? [] : []) {
      const accessor = primitive.attributes?.POSITION !== undefined ? gltf.accessors?.[primitive.attributes.POSITION] : undefined;
      if (!accessor?.min || !accessor?.max || accessor.min.length < 3 || accessor.max.length < 3) continue;
      const local = new Box3(new Vector3(...accessor.min.slice(0, 3)), new Vector3(...accessor.max.slice(0, 3)));
      box.union(local.applyMatrix4(world));
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const root of roots) visit(root, new Matrix4());

  if (box.isEmpty()) throw new GlbError("The GLB has no mesh with positions.");
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    min: [round(box.min.x), round(box.min.y), round(box.min.z)],
    max: [round(box.max.x), round(box.max.y), round(box.max.z)],
  };
}
