import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getProposal = vi.fn();
const saveProposal = vi.fn();
const startProjectModel = vi.fn();
const loadModelRun = vi.fn();
const loadProjectModel = vi.fn();
const addScoutedProject = vi.fn();
const editOutreachDraft = vi.fn();
const markSent = vi.fn();

vi.mock("@/features/proposal/store", () => ({
  getProposal: (...a: unknown[]) => getProposal(...a),
  saveProposal: (...a: unknown[]) => saveProposal(...a),
}));
vi.mock("@/features/proposal/generate", () => ({ generateProposal: vi.fn() }));
// The model run itself (generation, run records, the lock, the rate limit) is tested in scout/model.test.ts.
vi.mock("@/features/scout/model", () => ({
  loadProjectModel: (...a: unknown[]) => loadProjectModel(...a),
  loadModelRun: (...a: unknown[]) => loadModelRun(...a),
  startProjectModel: (...a: unknown[]) => startProjectModel(...a),
}));
vi.mock("@/features/scout/projects", () => ({
  addScoutedProject: (...a: unknown[]) => addScoutedProject(...a),
  listScoutedProjects: vi.fn(async () => []),
  getScoutedProject: vi.fn(async (id: string) => (id === "the-tower" ? { id, candidate: {}, addedAt: "" } : null)),
}));
vi.mock("@/features/dossier/load", () => ({ loadDossier: vi.fn(async () => null) }));
vi.mock("@/features/outreach/actions", () => ({ editOutreachDraft: (...a: unknown[]) => editOutreachDraft(...a) }));
vi.mock("@/features/project-agent/store", () => ({ listProjects: vi.fn(async () => []) }));
vi.mock("@/features/workspace/status", () => ({ loadStakeholder: vi.fn(), loadStakeholders: vi.fn() }));
vi.mock("@/features/workspace/state", () => ({ markBuilt: vi.fn(), markSent: (...a: unknown[]) => markSent(...a) }));

const proposal = (status: string) => ({
  clientId: "client-a",
  projectSlug: "demo-project",
  status,
  pitch: { headline: "h", teaserLine: "t" },
  shots: [],
});

async function tool(name: string) {
  const { createAppTools } = await import("./app-tools");
  const found = createAppTools().find((t) => t.name === name);
  if (!found) throw new Error(`no tool ${name}`);
  return found;
}

describe("app tools", () => {
  beforeEach(() => {
    for (const fn of [getProposal, saveProposal, startProjectModel, loadModelRun, loadProjectModel, addScoutedProject, editOutreachDraft, markSent]) {
      fn.mockReset();
    }
    saveProposal.mockResolvedValue("file");
    loadModelRun.mockResolvedValue(null);
    loadProjectModel.mockResolvedValue(null);
  });

  it("exposes every app tool once", async () => {
    const { createAppTools } = await import("./app-tools");
    expect(createAppTools().map((t) => t.name)).toEqual([
      "list_projects",
      "add_project_from_scout",
      "generate_project_model",
      "get_project_model",
      "get_stakeholder_status",
      "generate_proposal",
      "review_proposal",
      "edit_outreach_draft",
    ]);
  });

  it("marks a draft proposal sent by approving it first", async () => {
    getProposal.mockResolvedValue(proposal("draft"));
    const result = await (await tool("review_proposal")).run({ clientId: "client-a", action: "mark_sent" });
    expect(saveProposal.mock.calls.map(([p]) => p.status)).toEqual(["approved", "sent"]);
    expect(markSent).toHaveBeenCalledOnce();
    expect(result).toContain('"status":"sent"');
  });

  it("refuses to review a proposal that was never built", async () => {
    getProposal.mockResolvedValue(null);
    await expect((await tool("review_proposal")).run({ clientId: "client-a", action: "approve" })).resolves.toMatch(/generate_proposal first/);
  });

  it("starts a scouted project's model through the shared run, and refuses a second run meanwhile", async () => {
    const generate = await tool("generate_project_model");
    startProjectModel.mockResolvedValueOnce({ status: "started" }).mockResolvedValueOnce({ status: "running" });
    await expect(generate.run({ projectId: "the-tower" })).resolves.toContain('"status":"started"');
    expect(startProjectModel).toHaveBeenCalledWith(expect.objectContaining({ id: "the-tower" }), "agent-chat");
    await expect(generate.run({ projectId: "the-tower" })).resolves.toMatch(/already being generated/);
  });

  it("says how long to wait when the model rate limit is used up", async () => {
    startProjectModel.mockResolvedValueOnce({ status: "rate-limited", retryAfterS: 601 });
    await expect((await tool("generate_project_model")).run({ projectId: "the-tower" })).resolves.toMatch(/^Error: .*in 11 minutes/);
  });

  it("does not generate a model for the demo project or an unknown one", async () => {
    const generate = await tool("generate_project_model");
    await expect(generate.run({ projectId: "demo-project" })).resolves.toMatch(/model builder/);
    await expect(generate.run({ projectId: "nope" })).resolves.toMatch(/^Error/);
    expect(startProjectModel).not.toHaveBeenCalled();
  });

  it("reports a model run from its record: generating, failed, or ready", async () => {
    const status = await tool("get_project_model");
    loadModelRun.mockResolvedValueOnce({ projectId: "the-tower", status: "generating", startedAt: "2026-11-15T12:00:00.000Z" });
    loadProjectModel.mockResolvedValueOnce({ generatedAt: "2026-11-14T12:00:00.000Z", reply: "old" });
    // A run in progress wins over an older saved model.
    expect(JSON.parse(String(await status.run({ projectId: "the-tower" })))).toEqual({
      projectId: "the-tower",
      status: "generating",
      startedAt: "2026-11-15T12:00:00.000Z",
    });

    loadModelRun.mockResolvedValueOnce({ projectId: "the-tower", status: "failed", startedAt: "x", error: "The run stopped." });
    expect(JSON.parse(String(await status.run({ projectId: "the-tower" })))).toEqual({ projectId: "the-tower", status: "failed", error: "The run stopped." });

    expect(JSON.parse(String(await status.run({ projectId: "the-tower" })))).toEqual({ projectId: "the-tower", status: "none" });

    loadModelRun.mockResolvedValueOnce({ projectId: "the-tower", status: "ready", startedAt: "x" });
    loadProjectModel.mockResolvedValueOnce({
      generatedAt: "2026-11-15T12:04:00.000Z",
      reply: "Built.",
      geocodeStatus: "retrieved",
      contextStatus: "retrieved",
    });
    expect(JSON.parse(String(await status.run({ projectId: "the-tower" })))).toMatchObject({ status: "ready", notes: "Built." });
  });

  it("starts the model of a project it adds from scouting, but not of one already added", async () => {
    const add = await tool("add_project_from_scout");
    const project = { id: "the-tower", candidate: { name: "The Tower" }, addedAt: "" };
    addScoutedProject.mockResolvedValueOnce({ status: "added", project });
    startProjectModel.mockResolvedValueOnce({ status: "started" });
    expect(JSON.parse(String(await add.run({ candidateId: "the-tower" })))).toMatchObject({
      status: "added",
      id: "the-tower",
      model: "generating (about 2 to 4 minutes)",
    });
    expect(startProjectModel).toHaveBeenCalledWith(project, "agent-chat");

    addScoutedProject.mockResolvedValueOnce({ status: "exists", project });
    const again = JSON.parse(String(await add.run({ candidateId: "the-tower" })));
    expect(again).toMatchObject({ status: "already a project", id: "the-tower" });
    expect(again).not.toHaveProperty("model");
    expect(startProjectModel).toHaveBeenCalledOnce();
  });

  it("tells the agent when adding a project could not start its model", async () => {
    addScoutedProject.mockResolvedValueOnce({ status: "added", project: { id: "the-tower", candidate: { name: "T" }, addedAt: "" } });
    startProjectModel.mockResolvedValueOnce({ status: "rate-limited", retryAfterS: 120 });
    const out = JSON.parse(String(await (await tool("add_project_from_scout")).run({ candidateId: "the-tower" })));
    expect(out.status).toBe("added");
    expect(out.model).toMatch(/^not started: .*in 2 minutes/);
  });

  it("will not edit an email that was already sent", async () => {
    editOutreachDraft.mockResolvedValue({ status: "already-sent", message: {} });
    await expect((await tool("edit_outreach_draft")).run({ clientId: "client-a", subject: "New" })).resolves.toMatch(/already sent/);
  });
});
