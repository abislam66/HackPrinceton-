import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScoutedProject } from "./projects";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  after: () => {
    throw new Error("outside a request");
  },
}));

// Fakes for everything a run touches: the store, the generator, the rate limit, the dossier and the GLB save.
const { records, failRead, generateViewer, saveGeneratedBuilding, takeGeneration, order } = vi.hoisted(() => ({
  records: new Map<string, unknown>(),
  failRead: { value: false },
  generateViewer: vi.fn(),
  saveGeneratedBuilding: vi.fn(),
  takeGeneration: vi.fn(),
  order: [] as string[],
}));

vi.mock("@/lib/store/json-store", () => ({
  readRecord: async (collection: string, key: string, schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }) => {
    if (failRead.value) throw new Error("store down");
    const value = records.get(`${collection}/${key}`);
    if (value === undefined) return null;
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : null;
  },
  writeRecord: async (collection: string, key: string, value: unknown) => {
    order.push(`${collection}:${(value as { status?: string }).status ?? "page"}`);
    records.set(`${collection}/${key}`, structuredClone(value));
    return "memory";
  },
}));
vi.mock("@/features/building-viewer/generate", async () => {
  class StepError extends Error {
    constructor(public readonly step: string, message: string) {
      super(message);
    }
  }
  return { StepError, generateViewer: (...a: unknown[]) => generateViewer(...a) };
});
vi.mock("@/features/building-viewer/guard", () => ({ takeGeneration: (...a: unknown[]) => takeGeneration(...a) }));
vi.mock("@/features/dossier/load", () => ({ loadDossier: async () => null }));
vi.mock("@/features/model/generated", () => ({
  saveGeneratedBuilding: async (...a: unknown[]) => {
    order.push("glb");
    return saveGeneratedBuilding(...a);
  },
}));

const { StepError } = await import("@/features/building-viewer/generate");
const { loadModelRun, loadProjectModel, runProjectModel, startProjectModel, STALE_RUN_MS } = await import("./model");

const NOW = Date.parse("2026-11-15T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

const project = (id = "the-grove") =>
  ({
    id,
    addedAt: iso(NOW),
    candidate: {
      id,
      name: "The Grove",
      address: "120 Grove St",
      city: "Jersey City",
      state: "NJ",
      region: "new-jersey",
      buildingType: "32-story residential tower",
      stage: "under-construction",
      completion: "2026",
      floors: 32,
      valueUsd: null,
      whyItFits: "Tall and visible.",
      firms: [],
      score: 80,
      sourceIds: ["S1"],
    },
  }) as ScoutedProject;

const GENERATED = {
  result: {
    type: "result",
    html: "<!DOCTYPE html><title>x</title>",
    reply: "Built from the dossier.",
    geocode_status: "retrieved",
    context_status: "retrieved",
    drift: false,
    model_saved: false,
  },
  glb: new Uint8Array([1, 2, 3]),
  boundingBox: { min: [-10, 0, -10], max: [10, 90, 10] },
  obstacles: [{ name: "context-1", min: [20, 0, 0], max: [30, 12, 10] }],
  scene: {},
};

beforeEach(() => {
  records.clear();
  order.length = 0;
  failRead.value = false;
  generateViewer.mockReset();
  saveGeneratedBuilding.mockReset().mockResolvedValue({ meta: {}, storage: "memory" });
  takeGeneration.mockReset().mockResolvedValue({ ok: true });
});

describe("loadModelRun", () => {
  const put = (run: Record<string, unknown>) => records.set(`project-model-runs/${run.projectId}`, run);

  it("returns null for a bad id, a missing run, or a store that fails", async () => {
    expect(await loadModelRun("../etc", NOW)).toBeNull();
    expect(await loadModelRun("the-grove", NOW)).toBeNull();
    put({ projectId: "the-grove", status: "ready", startedAt: iso(NOW) });
    failRead.value = true;
    expect(await loadModelRun("the-grove", NOW)).toBeNull();
  });

  it("keeps a run that is still within the time limit generating", async () => {
    put({ projectId: "the-grove", status: "generating", startedAt: iso(NOW - STALE_RUN_MS + 1000) });
    expect((await loadModelRun("the-grove", NOW))?.status).toBe("generating");
  });

  it("reads a generating run past the time limit as failed, with a reason", async () => {
    expect(STALE_RUN_MS).toBe(310 * 1000); // just past the routes' 300 s maxDuration
    put({ projectId: "the-grove", status: "generating", startedAt: iso(NOW - STALE_RUN_MS - 1) });
    const run = await loadModelRun("the-grove", NOW);
    expect(run?.status).toBe("failed");
    expect(run?.error).toMatch(/stopped before it finished/);
    expect(run?.startedAt).toBe(iso(NOW - STALE_RUN_MS - 1));
  });

  it("leaves an old finished run as it is", async () => {
    put({ projectId: "the-grove", status: "ready", startedAt: iso(NOW - 86_400_000), finishedAt: iso(NOW - 86_000_000) });
    expect((await loadModelRun("the-grove", NOW))?.status).toBe("ready");
    put({ projectId: "the-grove", status: "failed", startedAt: iso(NOW - 86_400_000), error: "boom" });
    expect(await loadModelRun("the-grove", NOW)).toMatchObject({ status: "failed", error: "boom" });
  });
});

describe("runProjectModel", () => {
  it("saves the GLB, then the page, and records the run as ready", async () => {
    generateViewer.mockResolvedValue(structuredClone(GENERATED));
    const generated = await runProjectModel(project());
    expect(generated.result.model_saved).toBe(true);
    expect(order).toEqual(["project-model-runs:generating", "glb", "project-models:page", "project-model-runs:ready"]);
    expect(saveGeneratedBuilding.mock.calls[0][0]).toBe("the-grove");
    expect(await loadProjectModel("the-grove")).toMatchObject({ projectId: "the-grove", html: GENERATED.result.html, drift: false });
    expect((await loadModelRun("the-grove"))?.status).toBe("ready");
    // The generator gets the project's address and slug.
    expect(generateViewer.mock.calls[0][0]).toMatchObject({ address: "120 Grove St, Jersey City, NJ", projectSlug: "the-grove" });
  });

  it("records a step failure in the generator's words and rethrows it", async () => {
    generateViewer.mockRejectedValue(new StepError("assemble", "The building came out the wrong size."));
    await expect(runProjectModel(project())).rejects.toThrow("wrong size");
    expect(await loadModelRun("the-grove")).toMatchObject({ status: "failed", error: "The building came out the wrong size." });
    expect(await loadProjectModel("the-grove")).toBeNull();
  });

  it("records any other failure with a plain message", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    generateViewer.mockResolvedValue(structuredClone(GENERATED));
    saveGeneratedBuilding.mockRejectedValue(new Error("bucket write failed"));
    await expect(runProjectModel(project())).rejects.toThrow("bucket write failed");
    expect(await loadModelRun("the-grove")).toMatchObject({ status: "failed", error: "Generating the model failed. Try again." });
  });
});

describe("startProjectModel", () => {
  it("starts a run in the background and refuses a second one meanwhile", async () => {
    let finish: (value: unknown) => void = () => {};
    generateViewer.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    expect(await startProjectModel(project("tower-a"), "k")).toEqual({ status: "started" });
    expect(await startProjectModel(project("tower-a"), "k")).toEqual({ status: "running" });
    expect(takeGeneration).toHaveBeenCalledOnce();
    finish(structuredClone(GENERATED));
    await vi.waitFor(async () => expect((await loadModelRun("tower-a"))?.status).toBe("ready"));
    // Once finished, the lock is released.
    generateViewer.mockResolvedValue(structuredClone(GENERATED));
    expect(await startProjectModel(project("tower-a"), "k")).toEqual({ status: "started" });
    await vi.waitFor(() => expect(generateViewer).toHaveBeenCalledTimes(2));
  });

  it("reports a run another instance recorded as running", async () => {
    records.set("project-model-runs/tower-b", { projectId: "tower-b", status: "generating", startedAt: new Date().toISOString() });
    expect(await startProjectModel(project("tower-b"), "k")).toEqual({ status: "running" });
    expect(generateViewer).not.toHaveBeenCalled();
  });

  it("records a rate-limited start as failed and releases the lock", async () => {
    takeGeneration.mockResolvedValueOnce({ ok: false, retryAfterS: 600 });
    expect(await startProjectModel(project("tower-c"), "k")).toEqual({ status: "rate-limited", retryAfterS: 600 });
    expect(await loadModelRun("tower-c")).toMatchObject({ status: "failed", error: expect.stringMatching(/5 models/) });
    expect(generateViewer).not.toHaveBeenCalled();
    generateViewer.mockResolvedValue(structuredClone(GENERATED));
    expect(await startProjectModel(project("tower-c"), "k")).toEqual({ status: "started" });
  });
  it("fails closed when the rate limit can't be checked: no paid run, lock released", async () => {
    takeGeneration.mockRejectedValueOnce(new Error("store down"));
    expect(await startProjectModel(project("tower-d"), "k")).toEqual({ status: "unavailable" });
    expect(generateViewer).not.toHaveBeenCalled();
    generateViewer.mockResolvedValue(structuredClone(GENERATED));
    takeGeneration.mockResolvedValueOnce({ ok: true });
    expect(await startProjectModel(project("tower-d"), "k")).toEqual({ status: "started" });
  });
});
