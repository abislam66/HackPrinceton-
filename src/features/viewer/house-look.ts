import {
  BackSide,
  BoxGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  Matrix4,
  MeshLambertMaterial,
  ShaderMaterial,
  Vector3,
  Vector4,
  type Material,
  type Object3D,
} from "three";
import { CONTEXT_TOON, STREET_TOON, toonParams, type ToonParams } from "@/features/model/scene";
import type { FillerBlock } from "./filler";

/*
 * The building viewer's house look for every built model in ModelViewer (generated ones and the model builder's): two-tone toon shading split at brightness 0.18,
 * curtain-wall floor lines, mullions and bands, and dark outlines on edges steeper than 25 degrees. A port of the
 * locked toonMaterial and outline pass in building-viewer/scaffold.html; keep the two in step.
 *
 * A generated GLB carries each material's toon parameters in its extras (three's GLTFLoader puts them on
 * material.userData.toon). A material without them (a GLB from before) gets a toon pair from its own colour.
 */

const OUTLINE = 0x111122;
const LIGHT_SPLIT = 0.18;

/**
 * A hex colour as raw 0..1 channels, exactly as the scaffold does it. Not THREE.Color: with colour management on, it
 * converts sRGB to linear, and the shader writes its colour out with no conversion back, so the toon colours would
 * come out much darker than the hex.
 */
export const vec = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/**
 * The house stage around a model: a daytime sky and a ground that runs out to the horizon. The sky is pale haze at
 * the horizon, deepening to light blue overhead. The ground and the filler town fade into that same haze with
 * distance from the camera, as real air does, so ground and sky meet without a seam. Measured from the camera, not
 * the building: from high up, the town below stays clear and only the far distance hazes.
 * Mirrored in building-viewer/scaffold.html; keep the two in step.
 */
export const HOUSE_SKY = { zenith: "#8FB8DE", horizon: "#E6EEF2" } as const;
/** Metres from the camera: no haze nearer than `start`, all haze (the sky's horizon colour) from `end`. */
export const HOUSE_HAZE = { start: 1500, end: 8000 } as const;
/**
 * The ground disc follows the camera across the ground, so it never ends. It reaches past the haze's end, so where
 * it stops it is already sky-coloured.
 */
export const HOUSE_GROUND_RADIUS = 9500;

type ToonOptions = {
  /** Fade toward this colour with distance from the camera across HOUSE_HAZE: the ground and the filler town. */
  hazeTo?: string;
};

export function toonMaterial(p: ToonParams, options: ToonOptions = {}): MeshLambertMaterial {
  const curtain = p.type === "curtain";
  const material = new MeshLambertMaterial({ color: 0xffffff, side: DoubleSide });
  material.userData.nolines = p.nolines;
  material.userData.houseLook = true;
  const uniforms = {
    uLight: { value: vec(p.light) },
    uShade: { value: vec(p.shade) },
    uLine: { value: vec(curtain ? p.line : p.light) },
    uBand: { value: vec(curtain ? p.band : p.light) },
    uLineS: { value: vec(curtain ? p.line_shade : p.light) },
    uBandS: { value: vec(curtain ? p.band_shade : p.light) },
    uCurtain: { value: curtain ? 1 : 0 },
    uP: { value: new Vector4(p.floor_h, p.line_w, p.mull, p.mull_w) },
    uQ: { value: new Vector3(p.major_n, p.band_w, p.z0) },
    uHaze: { value: vec(options.hazeTo ?? p.light) },
    uHazeRange: { value: new Vector3(HOUSE_HAZE.start, HOUSE_HAZE.end, options.hazeTo ? 1 : 0) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      "varying vec3 vWPos; varying vec3 vWNrm;\n" +
      shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        // With instancing (the filler town), each instance's own matrix places it before the model matrix does.
        "#include <worldpos_vertex>\n vec4 houseWPos = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n houseWPos = instanceMatrix * houseWPos;\n#endif\n vWPos = (modelMatrix * houseWPos).xyz;\n vWNrm = normalize(mat3(modelMatrix) * objectNormal);",
      );
    shader.fragmentShader =
      `varying vec3 vWPos; varying vec3 vWNrm;
uniform vec3 uLineS, uBandS; uniform vec3 uLight, uShade, uLine, uBand; uniform float uCurtain; uniform vec4 uP; uniform vec3 uQ;
uniform vec3 uHaze, uHazeRange;
float lines(float c, float period, float w) { return (w <= 0.0) ? 0.0 : step(fract(c / period), w / period); }
` +
      shader.fragmentShader
        .replace(
          "#include <opaque_fragment>",
          `
  float b = max(max(outgoingLight.r, outgoingLight.g), outgoingLight.b);
  bool lit = b > ${LIGHT_SPLIT.toFixed(2)};
  vec3 col = lit ? uLight : uShade;
  if (uCurtain > 0.5) {
    vec3 n = normalize(vWNrm);
    float side = step(abs(n.y), 0.5);
    float uu = vWPos.x * abs(n.z) - vWPos.z * abs(n.x);
    float zz = vWPos.y - uQ.z;
    float minor = max(lines(zz, uP.x, uP.y), lines(uu, uP.z, uP.w)) * side;
    float major = lines(zz, uP.x * uQ.x, uQ.y) * side;
    col = mix(col, lit ? uLine : uLineS, minor);
    col = mix(col, lit ? uBand : uBandS, major);
  }
  col = mix(col, uHaze, smoothstep(uHazeRange.x, uHazeRange.y, distance(vWPos, cameraPosition)) * uHazeRange.z);
  gl_FragColor = vec4(col, 1.0);`,
        )
        .replace("#include <colorspace_fragment>", "")
        .replace("#include <tonemapping_fragment>", "");
  };
  return material;
}

/**
 * The sky: a dome around the camera (it follows the camera, so it never ends), shaded by view direction from the
 * horizon colour up to the zenith colour. Below the horizon it stays the horizon colour, the same haze the far ground
 * fades into. Drawn first and never written to depth, so everything else paints over it. Raw hex out, like the toon
 * shader, with a little dither so the long, gentle gradient doesn't band.
 */
export function skyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uZenith: { value: vec(HOUSE_SKY.zenith) }, uHorizon: { value: vec(HOUSE_SKY.horizon) } },
    vertexShader: `varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `uniform vec3 uZenith, uHorizon; varying vec3 vDir;
void main() {
  float up = clamp(normalize(vDir).y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(up, 0.45));
  float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  gl_FragColor = vec4(col + (noise - 0.5) / 255.0, 1.0);
}`,
    side: BackSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
}

/**
 * The model builder's materials (model-builder massing.py; the demo project's model.glb), by name, in the house
 * palette. Its GLB carries plain dark PBR colours and no toon extras, so the look comes from the part's name.
 */
export const BUILT_PART_TOONS: Record<string, ToonParams> = {
  context: CONTEXT_TOON,
  street: STREET_TOON,
  glass: toonParams({
    type: "curtain", light: "#7E9CAB", shade: "#4A6070", line: "#2A3442", band: "#1b1d33",
    floor_h: 3.3, line_w: 0.08, mull: 1.5, mull_w: 0.06, major_n: 4, band_w: 0.25,
  }),
  tile: toonParams({ type: "toon", light: "#F4F1EA", shade: "#A59C93" }),
  charcoal: toonParams({ type: "toon", light: "#3A3F4A", shade: "#1b1d33" }),
  roof: toonParams({ type: "toon", light: "#D9D3C7", shade: "#A59C93" }),
  metal: toonParams({ type: "toon", light: "#9A9EA3", shade: "#5E636B" }),
  sign: toonParams({ type: "toon", light: "#F4F1EA", shade: "#D9D3C7" }),
};

/**
 * Toon parameters for a material: its own extras (a generated model), else its name's (a built model), else a
 * light/shade pair from its colour.
 */
export function paramsFor(material: Material): ToonParams {
  const own = material.userData?.toon as ToonParams | undefined;
  if (own && typeof own.light === "string" && typeof own.shade === "string") return { ...toonParams({ type: "toon", light: own.light, shade: own.shade }), ...own };
  const named = BUILT_PART_TOONS[material.name];
  if (named) return named;
  const color = (material as Material & { color?: Color }).color ?? new Color("#cccccc");
  return toonParams({ type: "toon", light: `#${color.getHexString()}`, shade: `#${color.clone().multiplyScalar(0.62).getHexString()}` });
}

const lineMaterial = new LineBasicMaterial({ color: OUTLINE });

/**
 * Restyles a loaded generated model in place: toon materials, shadows and outlines. Idempotent (the loader caches
 * the scene, so it can be applied again on remount).
 */
export function applyHouseLook(root: Object3D): void {
  if (root.userData.houseLook) return;
  root.userData.houseLook = true;
  const made = new Map<string, MeshLambertMaterial>();
  const meshes: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
  });
  for (const mesh of meshes) {
    const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!made.has(source.uuid)) made.set(source.uuid, toonMaterial(paramsFor(source)));
    const material = made.get(source.uuid)!;
    mesh.material = material;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (material.userData.nolines) continue;
    const edges = new LineSegments(new EdgesGeometry(mesh.geometry, 25), lineMaterial);
    edges.raycast = () => {};
    mesh.add(edges);
  }
}

/**
 * The filler town's colours. Its sunlit roofs are a step lighter than the ground: the neighbours share the ground's
 * beige and are told apart by their outlines, but the filler has none, so from above, roofs in the ground's own colour
 * would vanish and leave only thin shaded walls, an empty plain.
 */
export const FILLER_TOON: ToonParams = toonParams({ type: "toon", light: "#E9E4DA", shade: "#ACA399" });

/**
 * The filler town (filler.ts) as one instanced mesh: the neighbours' beige, hazing out with distance like the ground.
 * No outlines and no shadows: it is background, and thousands of outlined boxes would be noise.
 */
export function fillerMesh(blocks: FillerBlock[]): InstancedMesh {
  const box = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const mesh = new InstancedMesh(box, toonMaterial(FILLER_TOON, { hazeTo: HOUSE_SKY.horizon }), blocks.length);
  const m = new Matrix4();
  blocks.forEach((b, i) => {
    mesh.setMatrixAt(i, m.makeScale(b.w, b.h, b.d).setPosition(b.x, 0, b.z));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = "filler";
  mesh.raycast = () => {};
  return mesh;
}
