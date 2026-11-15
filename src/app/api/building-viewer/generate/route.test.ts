import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/store/json-store", () => import("@/lib/store/test-store"));

const { saveGeneratedBuilding, projectFacts, scouted } = vi.hoisted(() => ({
  saveGeneratedBuilding: vi.fn(),
  projectFacts: new Set<string>(),
  scouted: new Set<string>(),
}));

/** What generateViewer returns: the result line plus the built model the route may save. */
function generated() {
  return {
    result: {
      type: "result",
      html: "<!DOCTYPE html>",
      reply: "ok",
      geocode_status: "retrieved",
      context_status: "retrieved",
      drift: false,
      model_json: null,
      model_json_status: "generated",
      project_slug: "x",
      sides: { photo: [], inferred: ["north", "east", "south", "west"] },
      model_saved: false,
    },
    glb: new Uint8Array([1, 2, 3]),
    boundingBox: { min: [-10, 0, -10], max: [10, 50, 10] },
    obstacles: [],
    scene: {},
  };
}

// The generator itself is mocked: these tests check the route's order of checks, never a paid call.
vi.mock("@/features/building-viewer/generate", () => ({
  StepError: class StepError extends Error {
    constructor(public readonly step: string, message: string) {
      super(message);
    }
  },
  generateViewer: vi.fn(async () => generated()),
}));
vi.mock("@/features/model/generated", () => ({ saveGeneratedBuilding: (...a: unknown[]) => saveGeneratedBuilding(...a) }));
vi.mock("@/features/project-agent/store", () => ({ loadProjectFacts: async (slug: string) => (projectFacts.has(slug) ? {} : null) }));
vi.mock("@/features/scout/projects", () => ({ getScoutedProject: async (slug: string) => (scouted.has(slug) ? { id: slug } : null) }));

import { POST } from "./route";

const CODE = "test-code";

function request(ip: string, fields: Record<string, string>, code: string | null = CODE) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  const headers = new Headers({ "x-forwarded-for": ip });
  if (code !== null) headers.set("x-access-code", code);
  return new Request("http://localhost/api/building-viewer/generate", { method: "POST", headers, body });
}

const GOOD = { address: "1601 N Broad St, Philadelphia, PA" };

describe("POST /api/building-viewer/generate rate limit", () => {
  beforeEach(() => vi.stubEnv("BUILDING_VIEWER_ACCESS_CODE", CODE));
  afterEach(() => vi.unstubAllEnvs());

  it("does not count requests rejected by the access code or the input checks", async () => {
    const ip = "203.0.113.10";
    for (let i = 0; i < 6; i++) {
      expect((await POST(request(ip, GOOD, "wrong"))).status).toBe(401);
      expect((await POST(request(ip, { address: "ab" }))).status).toBe(400);
    }
    // Twelve rejected requests later, the client still has all five runs.
    for (let i = 0; i < 5; i++) expect((await POST(request(ip, GOOD))).status).toBe(200);
  });

  it("refuses the sixth accepted run in the hour with 429 and Retry-After", async () => {
    const ip = "203.0.113.11";
    for (let i = 0; i < 5; i++) expect((await POST(request(ip, GOOD))).status).toBe(200);
    const sixth = await POST(request(ip, GOOD));
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toEqual({ error: "You've made 5 viewers in the last hour. Try again later.", step: "rate_limit" });
    expect(Number(sixth.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});

describe("POST /api/building-viewer/generate saving the model", () => {
  beforeEach(() => {
    vi.stubEnv("BUILDING_VIEWER_ACCESS_CODE", CODE);
    saveGeneratedBuilding.mockReset().mockResolvedValue({ meta: {}, storage: "memory" });
    projectFacts.clear();
    scouted.clear();
  });
  afterEach(() => vi.unstubAllEnvs());

  /** The last NDJSON line of the response. */
  async function lastLine(res: Response) {
    const lines = (await res.text()).trim().split("\n");
    return JSON.parse(lines[lines.length - 1]);
  }

  it("streams the result without the built model, and saves nothing without a project", async () => {
    const res = await POST(request("198.51.100.1", GOOD));
    const last = await lastLine(res);
    expect(last.type).toBe("result");
    expect(last.model_saved).toBe(false);
    expect(last).not.toHaveProperty("glb");
    expect(saveGeneratedBuilding).not.toHaveBeenCalled();
  });

  it("saves the GLB on a scouted project or a project with facts", async () => {
    scouted.add("the-tower");
    projectFacts.add("draft-project");
    expect((await lastLine(await POST(request("198.51.100.2", { ...GOOD, projectSlug: "the-tower" })))).model_saved).toBe(true);
    expect((await lastLine(await POST(request("198.51.100.2", { ...GOOD, projectSlug: "draft-project" })))).model_saved).toBe(true);
    expect(saveGeneratedBuilding.mock.calls.map(([slug]) => slug)).toEqual(["the-tower", "draft-project"]);
    expect(saveGeneratedBuilding.mock.calls[0][1]).toMatchObject({ glb: new Uint8Array([1, 2, 3]) });
  });

  it("never saves over the demo project or for an unknown project", async () => {
    projectFacts.add("demo-project");
    for (const projectSlug of ["demo-project", "nobody"]) {
      expect((await lastLine(await POST(request("198.51.100.3", { ...GOOD, projectSlug })))).model_saved).toBe(false);
    }
    expect(saveGeneratedBuilding).not.toHaveBeenCalled();
  });

  it("still sends the result when the save fails", async () => {
    scouted.add("the-tower");
    saveGeneratedBuilding.mockRejectedValueOnce(new Error("bucket down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const last = await lastLine(await POST(request("198.51.100.4", { ...GOOD, projectSlug: "the-tower" })));
    expect(last).toMatchObject({ type: "result", model_saved: false });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
