import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  after: () => {
    throw new Error("outside a request");
  },
}));

const getProposal = vi.fn();
const saveProposal = vi.fn();
const generateViewer = vi.fn();
const saveProjectModel = vi.fn();
const editOutreachDraft = vi.fn();
const markSent = vi.fn();

vi.mock("@/features/proposal/store", () => ({
  getProposal: (...a: unknown[]) => getProposal(...a),
  saveProposal: (...a: unknown[]) => saveProposal(...a),
}));
vi.mock("@/features/proposal/generate", () => ({ generateProposal: vi.fn() }));
vi.mock("@/features/building-viewer/generate", () => ({ generateViewer: (...a: unknown[]) => generateViewer(...a) }));
vi.mock("@/features/building-viewer/guard", () => ({ takeGeneration: () => ({ ok: true }) }));
vi.mock("@/features/scout/model", () => ({
  loadProjectModel: vi.fn(async () => null),
  saveProjectModel: (...a: unknown[]) => saveProjectModel(...a),
  viewerInputFor: () => ({ address: "1 Main St, Boston, MA", buildingName: "", knownFacts: "", notes: "" }),
}));
vi.mock("@/features/scout/projects", () => ({
  addScoutedProject: vi.fn(),
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
    for (const fn of [getProposal, saveProposal, generateViewer, saveProjectModel, editOutreachDraft, markSent]) fn.mockReset();
    saveProposal.mockResolvedValue("file");
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

  it("starts a scouted project's model in the background and refuses a second run meanwhile", async () => {
    let finish: (value: unknown) => void = () => {};
    generateViewer.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const generate = await tool("generate_project_model");
    await expect(generate.run({ projectId: "the-tower" })).resolves.toContain('"status":"started"');
    await expect(generate.run({ projectId: "the-tower" })).resolves.toMatch(/already being generated/);
    await expect((await tool("get_project_model")).run({ projectId: "the-tower" })).resolves.toContain("generating");
    finish({ html: "<html></html>", reply: "ok", geocode_status: "retrieved", context_status: "retrieved", drift: false });
    await vi.waitFor(() => expect(saveProjectModel).toHaveBeenCalledOnce());
  });

  it("does not generate a model for the demo project or an unknown one", async () => {
    const generate = await tool("generate_project_model");
    await expect(generate.run({ projectId: "demo-project" })).resolves.toMatch(/model builder/);
    await expect(generate.run({ projectId: "nope" })).resolves.toMatch(/^Error/);
    expect(generateViewer).not.toHaveBeenCalled();
  });

  it("will not edit an email that was already sent", async () => {
    editOutreachDraft.mockResolvedValue({ status: "already-sent", message: {} });
    await expect((await tool("edit_outreach_draft")).run({ clientId: "client-a", subject: "New" })).resolves.toMatch(/already sent/);
  });
});
