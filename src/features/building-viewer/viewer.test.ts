import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { accessCodeOk, takeGeneration, RATE_LIMIT, RATE_WINDOW_MS } from "./guard";
import { heightOf, toContext, DEFAULT_HEIGHT_M } from "./geo";
import {
  assemble,
  checkSubjectSafety,
  extractSubjectBlock,
  extractTitle,
  fillTemplate,
  hasScaffoldDrift,
  parseReply,
} from "./prompt";
import { detectPhotoType, viewerFormSchema } from "./schema";

const scaffold = readFileSync(path.join(process.cwd(), "building-viewer", "scaffold.html"), "utf8");
const template = readFileSync(path.join(process.cwd(), "building-viewer", "house_viewer_prompt.md"), "utf8");

const SUBJECT = `/* ===================== SUBJECT (REPLACE THIS BLOCK PER PROJECT) ===================== */
const SUBJECT = { title: "Test tower", dims: { width: 30, depth: 30, height: 90 }, context: [], materials: {} };
/* ===================== END SUBJECT BLOCK ===================== */`;

describe("prompt filling", () => {
  it("fills every placeholder", () => {
    const values = Object.fromEntries(
      [...template.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => [m[1], "x"]),
    );
    expect(fillTemplate(template, values)).not.toContain("{{");
  });

  it("refuses to leave a placeholder unfilled", () => {
    expect(() => fillTemplate("PROJECT: {{project_name}} {{address}}", { project_name: "A" })).toThrow(/address/);
  });
});

describe("reply parsing", () => {
  it("reads the page and the reply, and strips a code fence", () => {
    const text = "<html_output>\n```html\n<!DOCTYPE html><title>T</title>\n```\n</html_output>\n<reply>Done. Inferred: height.</reply>";
    const parsed = parseReply(text);
    expect(parsed.html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(parsed.reply).toBe("Done. Inferred: height.");
  });

  it("fails when a tag is missing", () => {
    expect(() => parseReply("<html_output>x</html_output>")).toThrow(/reply/);
  });
});

describe("scaffold splice", () => {
  it("extracts the subject block and the title from the scaffold", () => {
    expect(extractSubjectBlock(scaffold)).toContain("const SUBJECT = {");
    expect(extractTitle(scaffold)).toBe("House Scaffold");
  });

  it("replaces only the subject block and the title", () => {
    const out = assemble(scaffold, SUBJECT, "Test tower");
    expect(out).toContain("title: \"Test tower\"");
    expect(out).toContain("<title>Test tower</title>");
    expect(out).toContain("renderer.setClearColor(0xDC5527);"); // locked code is untouched
    expect(out.split("SUBJECT (REPLACE THIS BLOCK PER PROJECT)")).toHaveLength(2);
  });

  it("does not treat a changed subject or title as drift", () => {
    const modelPage = assemble(scaffold, SUBJECT, "Test tower");
    expect(hasScaffoldDrift(modelPage, scaffold)).toBe(false);
  });

  it("flags drift when locked code changes", () => {
    const edited = assemble(scaffold, SUBJECT, "Test tower").replace("0xDC5527", "0x000000");
    expect(hasScaffoldDrift(edited, scaffold)).toBe(true);
  });

  it("refuses subject code that breaks out of the page or reaches the network", () => {
    expect(() => checkSubjectSafety("const a = 1; </script><script>")).toThrow();
    expect(() => checkSubjectSafety("fetch('https://x')")).toThrow();
    expect(() => checkSubjectSafety("localStorage.setItem('a', 'b')")).toThrow();
    expect(() => checkSubjectSafety(SUBJECT)).not.toThrow();
  });
});

describe("map context", () => {
  const origin = { lat: 39.9780, lng: -75.1577 };
  const square = (dLat: number, dLng: number, size: number, tags: Record<string, string>, id: number) => ({
    type: "way",
    id,
    tags: { building: "yes", ...tags },
    geometry: [
      { lat: origin.lat + dLat, lon: origin.lng + dLng },
      { lat: origin.lat + dLat, lon: origin.lng + dLng + size },
      { lat: origin.lat + dLat + size, lon: origin.lng + dLng + size },
      { lat: origin.lat + dLat + size, lon: origin.lng + dLng },
    ],
  });

  it("uses height, then levels x 4.2, then the 12 m default, and marks each", () => {
    expect(heightOf({ height: "30" })).toEqual({ h: 30, height_status: "observed: OSM height tag" });
    expect(heightOf({ height: "100 ft" }).h).toBeCloseTo(30.5, 0);
    expect(heightOf({ "building:levels": "5" })).toEqual({ h: 21, height_status: "estimated: OSM building:levels 5 x 4.2 m" });
    expect(heightOf({})).toEqual({ h: DEFAULT_HEIGHT_M, height_status: "inferred: default 12 m" });
  });

  it("keeps nearby buildings, sorts them, and drops the one the point sits in", () => {
    const subject = square(-0.0002, -0.0002, 0.0004, { height: "50" }, 1); // contains the origin
    const near = square(0.0005, 0, 0.0002, { "building:levels": "4" }, 2);
    const far = square(0.01, 0.01, 0.0002, {}, 3); // beyond 150 m
    const items = toContext([subject, near, far], origin);
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe("OpenStreetMap way 2");
    expect(items[0].z).toBeLessThan(0); // north is -z
    expect(items[0].h).toBeCloseTo(16.8, 1);
  });
});

describe("input checks", () => {
  it("identifies a JPEG and a PNG by their bytes, not their claimed type", () => {
    expect(detectPhotoType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectPhotoType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe("image/png");
    expect(detectPhotoType(new TextEncoder().encode("GIF89a"))).toBeNull();
  });

  it("requires an address and bounds the optional fields", () => {
    expect(viewerFormSchema.safeParse({ address: "ab" }).success).toBe(false);
    expect(viewerFormSchema.safeParse({ address: "1601 N Broad St", notes: "x".repeat(1001) }).success).toBe(false);
    expect(viewerFormSchema.parse({ address: "1601 N Broad St" })).toEqual({
      address: "1601 N Broad St", buildingName: "", knownFacts: "", notes: "",
    });
  });
});

describe("access and rate limit", () => {
  it("fails closed without a configured code, and compares in constant time", () => {
    expect(accessCodeOk("abc", undefined)).toBe("not configured");
    expect(accessCodeOk(null, "abc")).toBe("denied");
    expect(accessCodeOk("abd", "abc")).toBe("denied");
    expect(accessCodeOk("abc", "abc")).toBe("ok");
  });

  it("allows five generations an hour per client, then asks to wait", () => {
    const key = `test-${Math.random()}`;
    const now = 1_000_000;
    for (let i = 0; i < RATE_LIMIT; i++) expect(takeGeneration(key, now).ok).toBe(true);
    const blocked = takeGeneration(key, now + 1000);
    expect(blocked.ok).toBe(false);
    expect(takeGeneration(key, now + RATE_WINDOW_MS + 1).ok).toBe(true);
  });
});
