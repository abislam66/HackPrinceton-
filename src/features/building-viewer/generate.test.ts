import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/store/json-store", () => import("@/lib/store/test-store"));

import { checkScene, generateViewer, retryPrompt, StepError } from "./generate";

const GOOD = {
  title: "Test tower",
  materials: { glass: { type: "curtain", light: "#7E9CAB", shade: "#4A6070" } },
  parts: [{ shape: "box", size: [20, 60, 20], at: [0, 0, 0], mat: "glass", basis: "observed" }],
};

describe("checkScene", () => {
  it("accepts a scene the schema accepts, with defaults filled", () => {
    const checked = checkScene({ ...GOOD, materials: { glass: { light: "#7E9CAB", shade: "#4A6070" } } });
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(checked.scene.materials.glass.type).toBe("toon");
  });

  it("refuses something that is not an object", () => {
    expect(checkScene(null)).toEqual({ ok: false, errors: ["the scene is not a JSON object"] });
    expect(checkScene("a tower")).toEqual({ ok: false, errors: ["the scene is not a JSON object"] });
  });

  it("names each problem by its path, for the retry", () => {
    const bad = checkScene({ ...GOOD, parts: [{ ...GOOD.parts[0], mat: "steel" }] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toContain('parts.0.mat: "steel" is not in materials');
    const empty = checkScene({});
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.errors.some((e) => e.startsWith("title:"))).toBe(true);
  });

  it("sends back at most 20 errors", () => {
    const parts = Array.from({ length: 30 }, () => ({ ...GOOD.parts[0], mat: "steel" }));
    const bad = checkScene({ ...GOOD, parts });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toHaveLength(20);
  });
});

describe("retryPrompt", () => {
  it("carries the scene, each error as a bullet, and the format", () => {
    const text = retryPrompt('{"title":"T"}', ["parts: expected array", "materials: use 1 to 6 materials, not 0"]);
    expect(text).toContain('{"title":"T"}');
    expect(text).toContain("- parts: expected array\n- materials: use 1 to 6 materials, not 0");
    expect(text).toContain("<scene_json></scene_json>");
    expect(text).toMatch(/No comments inside the JSON/);
  });

  it("says when there was nothing to parse, and caps a long scene", () => {
    expect(retryPrompt("", ["<scene_json> is missing"])).toContain("(nothing parseable)");
    const long = "x".repeat(50_000);
    const text = retryPrompt(long, ["e"]);
    expect(text).toContain("x".repeat(40_000));
    expect(text).not.toContain("x".repeat(40_001));
  });
});

describe("generateViewer", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("stops before any network call when the API key is not set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const emit = vi.fn();
    const run = generateViewer({ address: "1 Main St", buildingName: "", knownFacts: "", notes: "" }, null, emit);
    await expect(run).rejects.toBeInstanceOf(StepError);
    await expect(run).rejects.toMatchObject({ step: "model" });
    expect(emit).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
