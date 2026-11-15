import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { modelMetadataSchema } from "@/features/model/schema";
import { extractSubjectBlock } from "./prompt";
import {
  dimsFromSubject,
  fallbackModelJson,
  MODEL_FILE,
  parseModelJsonBlock,
  retryPrompt,
  sideSummary,
  slugFrom,
  validateModelJson,
} from "./model-json";

const scaffold = readFileSync(path.join(process.cwd(), "building-viewer", "scaffold.html"), "utf8");
const demoModel = JSON.parse(readFileSync(path.join(process.cwd(), "public", "models", "demo-project", "model.json"), "utf8"));

const GOOD = { boundingBox: { min: [-15, 0, -20], max: [15, 70, 20] }, knownSides: ["south", "north", "south"] };

describe("model.json block", () => {
  it("reads the JSON inside <model_json>, with or without a code fence", () => {
    expect(parseModelJsonBlock(`<reply>x</reply>\n<model_json>${JSON.stringify(GOOD)}</model_json>`)).toEqual(GOOD);
    expect(parseModelJsonBlock("<model_json>\n```json\n{\"a\":1}\n```\n</model_json>")).toEqual({ a: 1 });
  });

  it("returns null when the tag is missing or the JSON is broken", () => {
    expect(parseModelJsonBlock("<reply>x</reply>")).toBeNull();
    expect(parseModelJsonBlock("<model_json>{oops</model_json>")).toBeNull();
  });
});

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

  it("lists every problem so the retry can fix them", () => {
    const bad = validateModelJson({ boundingBox: { min: [5, 2, 0], max: [1, 50, 10] }, knownSides: [] }, "p");
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors).toContain("boundingBox: max x must be greater than min x");
    expect(bad.errors).toContain("boundingBox: min y must be 0 (ground level)");
    expect(validateModelJson({ knownSides: ["up"] }, "p").ok).toBe(false);
    expect(validateModelJson(null, "p").ok).toBe(false);
  });
});

describe("fallback from SUBJECT dims", () => {
  const subject = extractSubjectBlock(scaffold); // the placeholder: 20 x 30 x 20 m

  it("reads dims from the subject block", () => {
    expect(dimsFromSubject(subject)).toEqual({ width: 20, depth: 20, height: 30 });
  });

  it("builds a valid box centred on the origin, keeping only real side names", () => {
    const model = fallbackModelJson(subject, "p", ["west", "up"]);
    expect(model?.boundingBox).toEqual({ min: [-10, 0, -10], max: [10, 30, 10] });
    expect(model?.knownSides).toEqual(["west"]);
    expect(modelMetadataSchema.safeParse(model).success).toBe(true);
  });

  it("gives up when the subject has no readable dims", () => {
    expect(fallbackModelJson("const SUBJECT = {};", "p", [])).toBeNull();
  });
});

describe("retry prompt and slug", () => {
  it("carries the errors and the photo rule", () => {
    const text = retryPrompt("const SUBJECT = {};", ["boundingBox: min y must be 0"], false);
    expect(text).toContain("- boundingBox: min y must be 0");
    expect(text).toContain("knownSides must be []");
    expect(text).not.toContain("after </reply>");
  });

  it("makes a project slug from a name", () => {
    expect(slugFrom("CHOP Morgan Center for Research & Innovation")).toBe("chop-morgan-center-for-research-innovation");
    expect(slugFrom("***")).toBe("generated-building");
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
