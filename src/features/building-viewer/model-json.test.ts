import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { modelMetadataSchema } from "@/features/model/schema";
import { MODEL_FILE, sideSummary, slugFrom, validateModelJson } from "./model-json";

const demoModel = JSON.parse(readFileSync(path.join(process.cwd(), "public", "models", "demo-project", "model.json"), "utf8"));

const GOOD = { boundingBox: { min: [-15, 0, -20], max: [15, 70, 20] }, knownSides: ["south", "north", "south"] };

describe("validation against the model builder's schema", () => {
  it("is the schema demo-project's model.json uses", () => {
    expect(modelMetadataSchema.safeParse(demoModel).success).toBe(true);
  });

  it("builds a model.json the schema accepts, with server-set fields and clean sides", () => {
    const result = validateModelJson({ ...GOOD, projectSlug: "ignored", file: "evil.glb" }, "chop-morgan-center");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model).toEqual({
      projectSlug: "chop-morgan-center",
      file: MODEL_FILE,
      version: 1,
      units: "meters",
      boundingBox: GOOD.boundingBox,
      knownSides: ["north", "south"],
    });
    expect(modelMetadataSchema.parse(result.model)).toEqual(result.model);
  });

  it("lists every problem in the box", () => {
    const bad = validateModelJson({ boundingBox: { min: [5, 2, 0], max: [1, 50, 10] }, knownSides: [] }, "p");
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors).toContain("boundingBox: max x must be greater than min x");
    expect(bad.errors).toContain("boundingBox: min y must be 0 (ground level)");
    expect(validateModelJson({ knownSides: ["up"] }, "p").ok).toBe(false);
    expect(validateModelJson(null, "p").ok).toBe(false);
  });

  it("refuses a building over 1000 m tall or wide", () => {
    const tall = validateModelJson({ boundingBox: { min: [-5, 0, -5], max: [5, 1200, 5] }, knownSides: [] }, "p");
    expect(tall.ok).toBe(false);
    if (!tall.ok) expect(tall.errors).toContain("boundingBox: height over 1000 m");
    const wide = validateModelJson({ boundingBox: { min: [-600, 0, -5], max: [600, 50, 5] }, knownSides: [] }, "p");
    expect(wide.ok).toBe(false);
    if (!wide.ok) expect(wide.errors).toContain("boundingBox: footprint over 1000 m");
  });
});

describe("slug", () => {
  it("makes a project slug from a name", () => {
    expect(slugFrom("CHOP Morgan Center for Research & Innovation")).toBe("chop-morgan-center-for-research-innovation");
    expect(slugFrom("***")).toBe("generated-building");
    expect(slugFrom("a".repeat(80)).length).toBe(60);
  });
});

describe("side labels", () => {
  it("labels every side by its evidence, in compass order", () => {
    expect(sideSummary({ photo: ["south", "north"], inferred: ["east", "west"] })).toBe(
      "north (photo), east (inferred), south (photo), west (inferred)",
    );
    expect(sideSummary({ photo: [], inferred: ["north", "east", "south", "west"] })).toBe(
      "north (inferred), east (inferred), south (inferred), west (inferred)",
    );
  });
});
