import { Color, DoubleSide, EdgesGeometry, LineBasicMaterial, LineSegments, Mesh, MeshLambertMaterial, Vector3, Vector4, type Material, type Object3D } from "three";
import { toonParams, type ToonParams } from "@/features/model/scene";

/*
 * The building viewer's house look for generated models in ModelViewer: two-tone toon shading split at brightness 0.18,
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

export function toonMaterial(p: ToonParams): MeshLambertMaterial {
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
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      "varying vec3 vWPos; varying vec3 vWNrm;\n" +
      shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n vWNrm = normalize(mat3(modelMatrix) * objectNormal);",
      );
    shader.fragmentShader =
      `varying vec3 vWPos; varying vec3 vWNrm;
uniform vec3 uLineS, uBandS; uniform vec3 uLight, uShade, uLine, uBand; uniform float uCurtain; uniform vec4 uP; uniform vec3 uQ;
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
  gl_FragColor = vec4(col, 1.0);`,
        )
        .replace("#include <colorspace_fragment>", "")
        .replace("#include <tonemapping_fragment>", "");
  };
  return material;
}

/** Toon parameters for a material: its own extras, or a light/shade pair from its colour. */
function paramsFor(material: Material): ToonParams {
  const own = material.userData?.toon as ToonParams | undefined;
  if (own && typeof own.light === "string" && typeof own.shade === "string") return { ...toonParams({ type: "toon", light: own.light, shade: own.shade }), ...own };
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
