import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { metas, buildings, runs, scouted, startProjectModel } = vi.hoisted(() => ({
  metas: new Map<string, { version: number }>(),
  buildings: new Map<string, { kind: "demo" } | { kind: "scouted"; id: string }>(),
  runs: new Map<string, { status: string; error?: string }>(),
  scouted: new Set<string>(),
  startProjectModel: vi.fn(),
}));

vi.mock("@/features/model/generated", () => ({ loadGeneratedMeta: async (slug: string) => metas.get(slug) ?? null }));
vi.mock("@/features/project-agent/store", () => ({ projectBuilding: async (slug: string) => buildings.get(slug) ?? null }));
vi.mock("@/features/scout/model", () => ({
  loadModelRun: async (id: string) => runs.get(id) ?? null,
  startProjectModel: (...a: unknown[]) => startProjectModel(...a),
}));
vi.mock("@/features/scout/projects", () => ({ getScoutedProject: async (id: string) => (scouted.has(id) ? { id } : null) }));

import { GET, POST } from "./route";

const url = (project: string) => `http://localhost/api/model/generated?project=${project}`;
const get = async (project: string) => (await GET(new Request(url(project)))).json();
const post = async (project: string) => (await POST(new Request(url(project), { method: "POST" }))).json();

beforeEach(() => {
  metas.clear();
  buildings.clear();
  runs.clear();
  scouted.clear();
  startProjectModel.mockReset().mockResolvedValue({ status: "started" });
});

describe("GET /api/model/generated", () => {
  it("refuses the demo project and a bad slug", async () => {
    expect((await GET(new Request(url("demo-project")))).status).toBe(400);
    expect((await GET(new Request(url("../x")))).status).toBe(400);
    expect((await GET(new Request("http://localhost/api/model/generated"))).status).toBe(400);
  });

  it("says a project built on the demo building uses the model builder", async () => {
    buildings.set("demo-draft", { kind: "demo" });
    expect(await get("demo-draft")).toEqual({ status: "demo" });
  });

  it("reports a scouted building's run and model", async () => {
    buildings.set("tower-draft", { kind: "scouted", id: "tower" });
    expect(await get("tower-draft")).toEqual({ status: "none" });

    runs.set("tower", { status: "generating" });
    metas.set("tower", { version: 2 });
    // A new run in progress wins over the previous model, so the build waits for the new one.
    expect(await get("tower-draft")).toEqual({ status: "generating" });

    runs.set("tower", { status: "failed", error: "boom" });
    expect(await get("tower-draft")).toEqual({ status: "ready", version: 2 });

    metas.clear();
    expect(await get("tower-draft")).toEqual({ status: "failed", error: "boom" });
  });

  it("prefers the project's own generated model", async () => {
    metas.set("own", { version: 5 });
    expect(await get("own")).toEqual({ status: "ready", version: 5 });
  });
});

describe("POST /api/model/generated", () => {
  it("starts a model for a scouted building that has none", async () => {
    buildings.set("tower", { kind: "scouted", id: "tower" });
    scouted.add("tower");
    expect(await post("tower")).toEqual({ status: "generating" });
    expect(startProjectModel).toHaveBeenCalledWith({ id: "tower" }, expect.any(String));
  });

  it("leaves a ready, generating or failed model alone", async () => {
    buildings.set("tower", { kind: "scouted", id: "tower" });
    scouted.add("tower");
    metas.set("tower", { version: 1 });
    expect(await post("tower")).toEqual({ status: "ready", version: 1 });
    metas.clear();
    runs.set("tower", { status: "failed", error: "boom" });
    expect(await post("tower")).toEqual({ status: "failed", error: "boom" });
    runs.set("tower", { status: "generating" });
    expect(await post("tower")).toEqual({ status: "generating" });
    expect(startProjectModel).not.toHaveBeenCalled();
  });

  it("starts nothing for a project with no scouted building", async () => {
    expect(await post("unknown")).toEqual({ status: "none" });
    buildings.set("gone", { kind: "scouted", id: "gone" });
    expect(await post("gone")).toEqual({ status: "none" });
    expect(startProjectModel).not.toHaveBeenCalled();
  });

  it("reports the rate limit as a failure", async () => {
    buildings.set("tower", { kind: "scouted", id: "tower" });
    scouted.add("tower");
    startProjectModel.mockResolvedValueOnce({ status: "rate-limited", retryAfterS: 60 });
    expect(await post("tower")).toMatchObject({ status: "failed", error: expect.stringMatching(/5 models/) });
  });
});
