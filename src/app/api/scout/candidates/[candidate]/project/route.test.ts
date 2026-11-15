import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { addScoutedProject, startProjectModel } = vi.hoisted(() => ({ addScoutedProject: vi.fn(), startProjectModel: vi.fn() }));

vi.mock("@/features/scout/projects", () => ({ addScoutedProject: (...a: unknown[]) => addScoutedProject(...a) }));
vi.mock("@/features/scout/model", () => ({ startProjectModel: (...a: unknown[]) => startProjectModel(...a) }));

import { maxDuration, POST } from "./route";

const project = { id: "the-tower", candidate: { name: "The Tower" }, addedAt: "" };

function call(candidate: string) {
  const request = new Request(`http://localhost/api/scout/candidates/${candidate}/project`, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.50" },
  });
  return POST(request, { params: Promise.resolve({ candidate }) } as never);
}

beforeEach(() => {
  addScoutedProject.mockReset();
  startProjectModel.mockReset().mockResolvedValue({ status: "started" });
});

describe("POST /api/scout/candidates/[candidate]/project", () => {
  it("gives the background model run the full function time", () => {
    expect(maxDuration).toBe(300);
  });

  it("adds the project and starts its model", async () => {
    addScoutedProject.mockResolvedValueOnce({ status: "added", project });
    const res = await call("the-tower");
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ project, model: "started" });
    expect(startProjectModel).toHaveBeenCalledWith(project, expect.any(String));
  });

  it("still adds the project when the model cannot start", async () => {
    addScoutedProject.mockResolvedValueOnce({ status: "added", project });
    startProjectModel.mockRejectedValueOnce(new Error("store down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call("the-tower");
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ project, model: "not started" });
    error.mockRestore();
  });

  it("leaves an existing project's model alone", async () => {
    addScoutedProject.mockResolvedValueOnce({ status: "exists", project });
    const res = await call("the-tower");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ project });
    expect(startProjectModel).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown candidate and 400 for the demo", async () => {
    addScoutedProject.mockResolvedValueOnce({ status: "unknown-candidate" }).mockResolvedValueOnce({ status: "reserved" });
    expect((await call("nope")).status).toBe(404);
    expect((await call("demo-project")).status).toBe(400);
    expect(startProjectModel).not.toHaveBeenCalled();
  });
});
