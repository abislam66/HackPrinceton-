import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLACEHOLDER_BOUNDING_BOX, type ModelInfo, type ModelMetadata } from "@/features/model/schema";

vi.mock("server-only", () => ({}));

const { generated, buildings, demoModel, readCalls } = vi.hoisted(() => ({
  generated: new Map<string, unknown>(),
  buildings: new Map<string, { kind: "demo" } | { kind: "scouted"; id: string }>(),
  demoModel: { value: null as unknown },
  readCalls: [] as string[],
}));

vi.mock("@/features/model/generated", () => ({ loadGeneratedMeta: async (slug: string) => generated.get(slug) ?? null }));
vi.mock("@/features/project-agent/store", () => ({ projectBuilding: async (slug: string) => buildings.get(slug) ?? null }));
vi.mock("@/features/model/load", () => ({ loadModelInfo: async () => demoModel.value }));
// No per-stakeholder model files: every read is "not found", so the demo path falls back to loadModelInfo.
vi.mock("node:fs/promises", () => ({
  readFile: async (p: string) => {
    readCalls.push(String(p));
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
    buildings.clear();
    readCalls.length = 0;
    demoModel.value = DEMO;
  });

  it("gives the demo project its built model and never looks for a generated one", async () => {
    generated.set("demo-project", meta("demo-project"));
    expect(await loadStakeholderModel("some-client")).toEqual(DEMO);
  });

  it("uses the generated model saved for a project, served from the GLB route", async () => {
    generated.set("8-carlisle-new-york", meta("8-carlisle-new-york", 4));
    buildings.set("8-carlisle-new-york", { kind: "scouted", id: "8-carlisle-new-york" });
    expect(await loadStakeholderModel("c1", "8-carlisle-new-york")).toEqual({
      url: "/api/models/8-carlisle-new-york/glb?v=4",
      boundingBox: meta("x").boundingBox,
      knownSides: ["north", "east", "south", "west"],
      generated: true,
    });
  });

  it("uses a scouted building's model for a project opened from it", async () => {
    generated.set("8-carlisle-new-york", meta("8-carlisle-new-york", 2));
    buildings.set("carlisle-draft", { kind: "scouted", id: "8-carlisle-new-york" });
    const model = await loadStakeholderModel("c1", "carlisle-draft");
    expect(model.generated).toBe(true);
    expect(model.url).toBe("/api/models/8-carlisle-new-york/glb?v=2");
  });

  it("gives a scouted project with no generated model the gray box, never the demo's building", async () => {
    buildings.set("8-carlisle-new-york", { kind: "scouted", id: "8-carlisle-new-york" });
    expect(await loadStakeholderModel("c1", "8-carlisle-new-york")).toEqual({
      url: null,
      boundingBox: PLACEHOLDER_BOUNDING_BOX,
      knownSides: ["north", "east", "south", "west"],
    });
  });

  it("keeps the demo's model for a project opened from a draft of the demo", async () => {
    buildings.set("demo-draft", { kind: "demo" });
    expect(await loadStakeholderModel("c1", "demo-draft")).toEqual(DEMO);
  });

  it("falls back to the demo model for an unknown project", async () => {
    expect(await loadStakeholderModel("c1", "nope")).toEqual(DEMO);
  });
});
