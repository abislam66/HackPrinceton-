import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assembleViewer, fillTemplate, GLB_PLACEHOLDER, parseReply, parseSceneBlock, TITLE_PLACEHOLDER, type PromptValues } from "./prompt";

const scaffold = readFileSync(path.join(process.cwd(), "building-viewer", "scaffold.html"), "utf8");
const template = readFileSync(path.join(process.cwd(), "building-viewer", "house_viewer_prompt.md"), "utf8");

const SCENE = { title: "T", materials: { a: { light: "#ffffff", shade: "#000000" } }, parts: [] };

describe("the prompt template", () => {
  it("is filled by exactly the values the generator passes", () => {
    const values: PromptValues = {
      project_name: "P",
      address: "1 Main St",
      lat: "1",
      lng: "2",
      geocode_status: "retrieved",
      observed_facts: "none provided",
      user_notes: "none",
      photo_status: "none",
    };
    const filled = fillTemplate(template, values);
    expect(filled).not.toContain("{{");
    expect(filled).toContain("ADDRESS: 1 Main St");
    // Asks for the JSON scene, not page code.
    expect(template).toContain("<scene_json>");
  });
});

describe("reply parsing", () => {
  it("reads the scene and the reply", () => {
    const parsed = parseReply(`<scene_json>${JSON.stringify(SCENE)}</scene_json>\n<reply> Done. Inferred: height. </reply>`);
    expect(parsed.scene).toEqual(SCENE);
    expect(parsed.sceneError).toBeNull();
    expect(parsed.reply).toBe("Done. Inferred: height.");
  });

  it("strips one code fence inside the tags", () => {
    const fenced = parseSceneBlock(`<scene_json>\n\`\`\`json\n${JSON.stringify(SCENE)}\n\`\`\`\n</scene_json>`);
    expect(fenced.scene).toEqual(SCENE);
    expect(fenced.sceneText).toBe(JSON.stringify(SCENE));
    expect(parseSceneBlock("<scene_json>\n```\n{\"a\":1}\n```\n</scene_json>").scene).toEqual({ a: 1 });
  });

  it("returns the text and the reason when the JSON does not parse", () => {
    const bad = parseSceneBlock("<scene_json>{oops</scene_json>");
    expect(bad.scene).toBeNull();
    expect(bad.sceneText).toBe("{oops");
    expect(bad.sceneError).toMatch(/^the JSON does not parse/);
  });

  it("says when the scene tag is missing, and keeps the reply", () => {
    expect(parseSceneBlock("<reply>x</reply>")).toEqual({ scene: null, sceneText: "", sceneError: "<scene_json> is missing" });
    const parsed = parseReply("<reply>x</reply>");
    expect(parsed.scene).toBeNull();
    expect(parsed.reply).toBe("x");
  });

  it("throws only when the reply is missing", () => {
    expect(() => parseReply(`<scene_json>${JSON.stringify(SCENE)}</scene_json>`)).toThrow(/reply/);
  });
});

describe("viewer assembly", () => {
  const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 255, 254]);

  it("fills the real scaffold's title and GLB placeholders, leaving the locked code alone", () => {
    expect(scaffold).toContain(`"${TITLE_PLACEHOLDER}"`);
    expect(scaffold).toContain(`"${GLB_PLACEHOLDER}"`);
    const out = assembleViewer(scaffold, "Test tower", glb);
    expect(out).not.toContain(TITLE_PLACEHOLDER);
    expect(out).not.toContain(GLB_PLACEHOLDER);
    expect(out).toContain("<title>Test tower</title>");
    expect(out).toContain('title: "Test tower"');
    expect(out).toContain(`"${Buffer.from(glb).toString("base64")}"`);
    // Everything outside the two placeholders and the <title> is the scaffold's.
    const strip = (html: string) =>
      html
        .replace(/<title>[^<]*<\/title>/, "<title></title>")
        .replace(/const SUBJECT = \{ title: "[^"]*" \};/, "")
        .replace(/const MODEL_GLB = "[^"]*";/, "");
    expect(strip(out)).toBe(strip(scaffold));
  });

  it("escapes a title that tries to close the script or the title", () => {
    const title = '</script><b>"x"';
    const out = assembleViewer(scaffold, title, glb);
    expect(out).toContain("<title>&lt;/script&gt;&lt;b&gt;&quot;x&quot;</title>");
    expect(out).toContain('title: "\\u003c/script>\\u003cb>\\"x\\""');
    expect(out).not.toContain(title);
    // Only the scaffold's own closing script tags remain.
    expect(out.split("</script>").length).toBe(scaffold.split("</script>").length);
  });

  it("does not treat $ patterns in the title as replacement patterns", () => {
    const out = assembleViewer(scaffold, "Tower $& $1 $$", glb);
    expect(out).toContain("<title>Tower $&amp; $1 $$</title>");
    expect(out).toContain('title: "Tower $& $1 $$"');
  });

  it("throws when the scaffold has no placeholders", () => {
    expect(() => assembleViewer("<html><title>x</title></html>", "T", glb)).toThrow(/placeholders/);
    expect(() => assembleViewer(scaffold.replace(`"${GLB_PLACEHOLDER}"`, '""'), "T", glb)).toThrow(/placeholders/);
    expect(() => assembleViewer(scaffold.replace(`"${TITLE_PLACEHOLDER}"`, '""'), "T", glb)).toThrow(/placeholders/);
  });
});
