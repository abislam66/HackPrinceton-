import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/dossiers/[project]/route";
import { POST, maxDuration } from "@/app/api/dossiers/[project]/runs/route";
import { replayRun, streamRun, type RunSpec } from "@/lib/agent/run";
import { writeRecord } from "@/lib/store/json-store";
import { runDossier } from "./dossier";
import { loadDossier } from "./load";
import type { Dossier, DossierTarget } from "./schema";
import { resolveTarget } from "./target";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agent/run", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent/run")>()),
  streamRun: vi.fn(() => new Response("stream")),
  replayRun: vi.fn(async () => new Response("replay")),
}));
vi.mock("@/lib/store/json-store", () => ({ writeRecord: vi.fn(async () => "memory") }));
vi.mock("./target", () => ({ resolveTarget: vi.fn() }));
vi.mock("./load", () => ({ loadDossier: vi.fn() }));
vi.mock("./dossier", () => ({ runDossier: vi.fn() }));

const target: DossierTarget = {
  projectId: "demo-project",
  name: "Morgan Hall North",
  address: "1601 N Broad St",
  city: "Philadelphia",
  state: "PA",
  hints: [],
};
const dossier = { projectId: "demo-project" } as Dossier;

const params = (project: string) => ({ params: Promise.resolve({ project }) });
const post = (project: string, query = "") =>
  POST(new Request(`http://localhost/api/dossiers/${project}/runs${query}`, { method: "POST" }), params(project));

beforeEach(() => {
  vi.mocked(resolveTarget).mockReset().mockImplementation(async (id) => (id === "demo-project" ? target : null));
  vi.mocked(loadDossier).mockReset().mockResolvedValue(null);
  vi.mocked(streamRun).mockClear();
  vi.mocked(replayRun).mockClear();
});

describe("POST /api/dossiers/[project]/runs", () => {
  it("allows a long run", () => {
    expect(maxDuration).toBe(300);
  });

  it("rejects a malformed id and 404s an unknown project", async () => {
    expect((await post("Bad_Id")).status).toBe(400);
    expect((await post("nowhere")).status).toBe(404);
    expect(streamRun).not.toHaveBeenCalled();
  });

  it("replays the recording with ?replay=1", async () => {
    const response = await post("demo-project", "?replay=1&speed=3");
    expect(await response.text()).toBe("replay");
    expect(replayRun).toHaveBeenCalledWith(
      "dossier-demo-project.ndjson",
      ["src/features/dossier/recordings/dossier-demo-project.ndjson"],
      3,
    );
    expect(streamRun).not.toHaveBeenCalled();
  });

  it("streams a live run that saves to the store and falls back to the last dossier", async () => {
    const response = await post("demo-project");
    expect(await response.text()).toBe("stream");
    const spec = vi.mocked(streamRun).mock.calls[0][0] as RunSpec<Dossier>;
    expect(spec).toMatchObject({ key: "dossier:demo-project", deadlineMs: 180_000, recordAs: "dossier-demo-project.ndjson" });

    const ctx = { signal: new AbortController().signal, progress: () => {} };
    await spec.run(ctx);
    expect(runDossier).toHaveBeenCalledWith(target, ctx);
    await spec.save?.(dossier);
    expect(writeRecord).toHaveBeenCalledWith("dossiers", "demo-project", dossier);
    await spec.fallback?.();
    expect(loadDossier).toHaveBeenCalledWith("demo-project");
  });
});

describe("GET /api/dossiers/[project]", () => {
  it("returns the stored dossier with its source", async () => {
    vi.mocked(loadDossier).mockResolvedValue({ source: "snapshot", data: dossier });
    const response = await GET(new Request("http://localhost/api/dossiers/demo-project"), params("demo-project"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ source: "snapshot", data: dossier });
  });

  it("404s when there is no dossier", async () => {
    const response = await GET(new Request("http://localhost/api/dossiers/nowhere"), params("nowhere"));
    expect(response.status).toBe(404);
  });
});
