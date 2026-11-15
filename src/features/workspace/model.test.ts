import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLACEHOLDER_BOUNDING_BOX, type ModelInfo, type ModelMetadata } from "@/features/model/schema";

vi.mock("server-only", () => ({}));

const { generated, obstacles, buildings, demoModel, readCalls } = vi.hoisted(() => ({
  generated: new Map<string, unknown>(),
  obstacles: new Map<string, unknown[]>(),
  buildings: new Map<string, { kind: "demo" } | { kind: "scouted"; id: string }>(),
  demoModel: { value: null as unknown },
  readCalls: [] as string[],
}));

vi.mock("@/features/model/generated", () => ({
  loadGeneratedMeta: async (slug: string) => generated.get(slug) ?? null,
  loadGeneratedObstacles: async (slug: string) => obstacles.get(slug) ?? [],
}));
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
    obstacles.clear();
    buildings.clear();
    readCalls.length = 0;
    demoModel.value = DEMO;
  });

  it("gives the demo project its built model and never looks for a generated one", async () => {
    generated.set("demo-project", meta("demo-project"));
    expect(await loadStakeholderModel("some-client")).toEqual(DEMO);
  });

  it("uses the generated model saved for a project, served from the GLB route, with its own neighbours", async () => {
    const neighbours = [{ name: "context-1", min: [20, 0, -5], max: [30, 40, 5] }];
    generated.set("8-carlisle-new-york", meta("8-carlisle-new-york", 4));
    obstacles.set("8-carlisle-new-york", neighbours);
    buildings.set("8-carlisle-new-york", { kind: "scouted", id: "8-carlisle-new-york" });
    expect(await loadStakeholderModel("c1", "8-carlisle-new-york")).toEqual({
      url: "/api/models/8-carlisle-new-york/glb?v=4",
      boundingBox: meta("x").boundingBox,
      knownSides: ["north", "east", "south", "west"],
      generated: true,
      obstacles: neighbours,
    });
  });

  it("gives a generated model with no stored neighbours an empty obstacle list", async () => {
    generated.set("tower", meta("tower"));
    const model = await loadStakeholderModel("c1", "tower");
    expect(model.generated).toBe(true);
    expect(model.obstacles).toEqual([]);
  });

  it("uses a scouted building's model for a project opened from it", async () => {
    generated.set("8-carlisle-new-york", meta("8-carlisle-new-york", 2));
    obstacles.set("8-carlisle-new-york", [{ name: "context-2", min: [0, 0, 0], max: [1, 1, 1] }]);
    buildings.set("carlisle-draft", { kind: "scouted", id: "8-carlisle-new-york" });
    const model = await loadStakeholderModel("c1", "carlisle-draft");
    expect(model.generated).toBe(true);
    expect(model.url).toBe("/api/models/8-carlisle-new-york/glb?v=2");
    // The building's neighbours, not the draft's.
    expect(model.obstacles).toEqual([{ name: "context-2", min: [0, 0, 0], max: [1, 1, 1] }]);
  });

  it("gives a scouted project with no generated model the gray box, never the demo's building or neighbours", async () => {
    buildings.set("8-carlisle-new-york", { kind: "scouted", id: "8-carlisle-new-york" });
    const model = await loadStakeholderModel("c1", "8-carlisle-new-york");
    expect(model).toEqual({
      url: null,
      boundingBox: PLACEHOLDER_BOUNDING_BOX,
      knownSides: ["north", "east", "south", "west"],
      generated: true,
    });
    // generated: true, so the shot compiler uses no obstacles rather than the demo's.
    expect(model.obstacles ?? []).toEqual([]);
  });

  it("keeps the demo's model for a project opened from a draft of the demo", async () => {
    buildings.set("demo-draft", { kind: "demo" });
    expect(await loadStakeholderModel("c1", "demo-draft")).toEqual(DEMO);
  });

  it("falls back to the demo model for an unknown project", async () => {
    expect(await loadStakeholderModel("c1", "nope")).toEqual(DEMO);
  });
});
