import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@/features/project/schema";
import type { Proposal } from "@/features/proposal/schema";

vi.mock("server-only", () => ({}));

const client = (id: string, need: Client["need"] = "sales-and-bids"): Client => ({
  id,
  company: `Company ${id}`,
  role: "trade",
  contact: { name: "A", title: "T" },
  need,
  needsNotes: "notes",
  focusElements: ["curtain wall"],
});

// data/: the pre-loaded briefs.
const preloaded = new Map<string, Client>([
  ["client-a", client("client-a")],
  ["client-b", client("client-b")],
]);
// The project agent's view: per project, its stakeholders after replacements and additions.
const projects = new Map<string, Client[]>();
vi.mock("@/features/project/load", () => ({
  loadClient: async (id: string) => structuredClone(preloaded.get(id) ?? null),
}));
vi.mock("@/features/project-agent/store", () => ({
  listProjects: async () => [...projects.keys()].map((id) => ({ id, name: id, basedOn: null, createdAt: null })),
  loadProjectClients: async (project: string) => structuredClone(projects.get(project) ?? null),
  loadProjectClient: async (project: string, id: string) =>
    structuredClone(projects.get(project)?.find((c) => c.id === id) ?? null),
}));

// Proposals keyed by project, as getProposal(clientId, project) reads them.
const proposals = new Map<string, Proposal>();
vi.mock("@/features/proposal/store", () => ({
  getProposal: async (clientId: string, project = "demo-project") => proposals.get(`${project}/${clientId}`) ?? null,
}));
vi.mock("@/features/tracking/record", () => ({ listEvents: async () => [] }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => false }));

const { findStakeholder, loadStakeholder, loadStakeholders } = await import("./status");
const { clearWorkspaceMemory, markBuilt } = await import("./state");

function propose(project: string, clientId: string, status: Proposal["status"] = "draft") {
  proposals.set(`${project}/${clientId}`, {
    clientId,
    projectSlug: project,
    status,
    pitch: { teaserLine: "t", headline: `h ${project}`, problem: "p", solution: "s", shotCaptions: [], acrossProject: "a" },
    shots: [],
  });
}

beforeEach(() => {
  projects.clear();
  proposals.clear();
  clearWorkspaceMemory();
  projects.set("demo-project", [client("client-a"), client("client-b", "recruiting")]);
  projects.set("demo-project-2", [client("client-a-p2")]);
});

describe("project-scoped stakeholders", () => {
  it("lists a project's own stakeholders, and nothing for an unknown project", async () => {
    expect((await loadStakeholders("demo-project")).map((s) => s.client.id)).toEqual(["client-a", "client-b"]);
    expect((await loadStakeholders("demo-project-2")).map((s) => s.client.id)).toEqual(["client-a-p2"]);
    expect(await loadStakeholders("nope")).toEqual([]);
    expect(await loadStakeholder("demo-project-2", "client-a")).toBeNull();
  });

  it("reads each project's own proposal", async () => {
    propose("demo-project", "client-a");
    propose("demo-project-2", "client-a-p2");
    const copy = await loadStakeholder("demo-project-2", "client-a-p2");
    expect(copy?.proposal?.pitch.headline).toBe("h demo-project-2");
    expect(copy?.projectSlug).toBe("demo-project-2");
  });

  it("finds which project holds a stakeholder id", async () => {
    expect(await findStakeholder("client-a-p2")).toMatchObject({ projectSlug: "demo-project-2" });
    expect(await findStakeholder("client-b")).toMatchObject({ projectSlug: "demo-project" });
    expect(await findStakeholder("missing")).toBeNull();
  });
});

describe("changes by the project agent", () => {
  it("keeps an unchanged pre-loaded stakeholder not built until this demo run builds it", async () => {
    propose("demo-project", "client-a");
    const before = await loadStakeholder("demo-project", "client-a");
    expect(before).toMatchObject({ changedByAgent: false, stage: "not-built" });
    markBuilt("client-a");
    expect(await loadStakeholder("demo-project", "client-a")).toMatchObject({ stage: "ready" });
  });

  it("treats a replaced brief as changed, and its drafted proposal as ready", async () => {
    // client-b's pre-loaded need is sales-and-bids; the project now says recruiting.
    propose("demo-project", "client-b");
    expect(await loadStakeholder("demo-project", "client-b")).toMatchObject({ changedByAgent: true, stage: "ready" });
  });

  it("treats every stakeholder of a project opened from a draft as changed", async () => {
    propose("demo-project-2", "client-a-p2");
    expect(await loadStakeholder("demo-project-2", "client-a-p2")).toMatchObject({ changedByAgent: true, stage: "ready" });
  });

  it("shows a changed stakeholder with no proposal as not built, never another project's proposal", async () => {
    propose("demo-project", "client-a");
    const copy = await loadStakeholder("demo-project-2", "client-a-p2");
    expect(copy).toMatchObject({ changedByAgent: true, stage: "not-built", proposal: null });
  });

  it("keeps a sent proposal sent", async () => {
    propose("demo-project-2", "client-a-p2", "sent");
    expect(await loadStakeholder("demo-project-2", "client-a-p2")).toMatchObject({ stage: "sent" });
  });
});
