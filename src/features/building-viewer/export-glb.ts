/*
 * Exporting a generated viewer's building as a GLB, in the browser.
 *
 * The scaffold's scene lives inside a sandboxed iframe, so the page can't reach it. Instead the page builds a second,
 * hidden sandboxed iframe that loads the same three.js, runs only the SUBJECT block (the building's own code), and
 * exports the subject building alone with GLTFExporter. The result comes back by postMessage. The subject code is
 * model-written, so it never runs in the page itself: the iframe has no same-origin access, no cookies and no keys.
 *
 * Same units and axes as demo-project's model.glb: metres, +Y up, ground at y = 0. Materials are plain colours taken from
 * each material's light colour (the scaffold's toon shader is a viewer effect, not part of the model).
 */

export const THREE_VERSION = "0.160.0";
const CDN = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}`;

/** The page that runs the subject block and posts `{type:"glb", glb}` or `{type:"glb-error", message}` to its parent. */
export function buildExportPage(subjectBlock: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"${CDN}/build/three.module.js","three/addons/":"${CDN}/examples/jsm/"}}</script>
</head><body>
<script type="module">
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

const fail = (message) => parent.postMessage({ type: "glb-error", message: String(message) }, "*");
window.addEventListener("error", (e) => fail(e.message));

// The scaffold's helpers that the subject block calls, reduced to plain materials.
function toonMaterial(m) {
  const p = m || {};
  return new THREE.MeshStandardMaterial({ color: p.light || "#cccccc", roughness: 0.9, metalness: 0 });
}
const CONTEXT_MATERIAL = { light: "#D9D3C7", shade: "#A59C93" };

${subjectBlock}

try {
  const { group } = buildSubject();
  // The subject's meshes come first; SUBJECT.context adds one mesh per neighbour after them.
  const neighbours = (SUBJECT.context || []).length;
  const keep = group.children.slice(0, Math.max(1, group.children.length - neighbours));
  const out = new THREE.Group();
  keep.forEach((child) => out.add(child));
  out.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(out);
  if (box.isEmpty()) throw new Error("The subject has no geometry.");
  out.position.y -= box.min.y; // ground at y = 0
  new GLTFExporter().parse(
    out,
    (glb) => parent.postMessage({ type: "glb", glb }, "*", [glb]),
    (error) => fail(error && error.message ? error.message : error),
    { binary: true },
  );
} catch (error) {
  fail(error && error.message ? error.message : error);
}
</script>
</body></html>`;
}
