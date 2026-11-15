import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLACEHOLDER_BOUNDING_BOX, type ModelInfo, type ModelMetadata } from "@/features/model/schema";

vi.mock("server-only", () => ({}));

const { generated, demoModel } = vi.hoisted(() => ({
  generated: new Map<string, unknown>(),
  demoModel: { value: null as unknown },
}));

vi.mock("@/features/model/generated", () => ({ loadGeneratedMeta: async (slug: string) => generated.get(slug) ?? null }));
vi.mock("@/features/model/load", () => ({ loadModelInfo: async () => demoModel.value }));
// No per-stakeholder model files: every read is "not found", so the demo path falls back to loadModelInfo.
vi.mock("node:fs/promises", () => ({
  readFile: async () => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  },
}));

const { loadStakeholderModel } = await import("./model");

const meta = (slug: string, version = 1): ModelMetadata => ({
  projectSlug: slug,
  file: "model.glb",
  version,
  units: "meters",
  boundingBox: { min: [-12, 0, -9], max: [12, 60, 9] },
  knownSides: ["north", "east", "south", "west"],
});
const DEMO: ModelInfo = { url: "/models/demo-project/model.glb?v=1", boundingBox: PLACEHOLDER_BOUNDING_BOX, knownSides: ["south"] };

describe("loadStakeholderModel", () => {
  beforeEach(() => {
    generated.clear();
    demoModel.value = DEMO;
  });

  it("gives the demo project its built model and never looks for a generated one", async () => {
    generated.set("demo-project", meta("demo-project"));
    expect(await loadStakeholderModel("some-client")).toEqual(DEMO);
  });

  it("uses the generated model saved for a project, served from the GLB route", async () => {
    generated.set("8-carlisle-new-york", meta("8-carlisle-new-york", 4));
    expect(await loadStakeholderModel("c1", "8-carlisle-new-york")).toEqual({
      url: "/api/models/8-carlisle-new-york/glb?v=4",
      boundingBox: meta("x").boundingBox,
      knownSides: ["north", "east", "south", "west"],
      generated: true,
    });
  });

  it("falls back to the demo model for a project with no generated model", async () => {
    expect(await loadStakeholderModel("c1", "no-model-yet")).toEqual(DEMO);
  });
});
