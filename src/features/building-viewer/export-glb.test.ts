import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildExportPage, THREE_VERSION } from "./export-glb";
import { extractSubjectBlock } from "./prompt";

const scaffold = readFileSync(path.join(process.cwd(), "building-viewer", "scaffold.html"), "utf8");
const subject = extractSubjectBlock(scaffold);

describe("GLB export page", () => {
  const page = buildExportPage(subject);

  it("loads the same three.js as the scaffold, with the exporter", () => {
    expect(scaffold).toContain(`three@${THREE_VERSION}`);
    expect(page).toContain(`three@${THREE_VERSION}/build/three.module.js`);
    expect(page).toContain("GLTFExporter.js");
  });

  it("runs only the SUBJECT block, after the helpers it calls", () => {
    expect(page.indexOf("function toonMaterial")).toBeLessThan(page.indexOf("const SUBJECT = {"));
    expect(page.indexOf("const SUBJECT = {")).toBeLessThan(page.indexOf("buildSubject()"));
    expect(page).not.toContain("OrbitControls"); // none of the viewer's locked code comes along
    expect(page).not.toContain("renderer");
  });

  it("exports binary, drops neighbours, and puts the ground at y = 0", () => {
    expect(page).toContain("binary: true");
    expect(page).toContain("SUBJECT.context");
    expect(page).toContain("out.position.y -= box.min.y");
    expect(page).toContain('type: "glb"');
  });

  it("is a single page with one script tag pair for the module", () => {
    expect(page.match(/<script type="module">/g)).toHaveLength(1);
    expect(page.match(/<\/script>/g)).toHaveLength(2); // importmap + module
  });
});
