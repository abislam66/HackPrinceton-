import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@/features/project/schema";
import type { Proposal } from "@/features/proposal/schema";

vi.mock("server-only", () => ({}));

// In-memory stand-ins for the shared json store and the proposal store, so tests never touch .data/.
const records = new Map<string, Map<string, unknown>>();
vi.mock("@/lib/store/json-store", () => ({
  writeRecord: async (collection: string, key: string, value: unknown) => {
    if (!records.has(collection)) records.set(collection, new Map());
    records.get(collection)!.set(key, structuredClone(value));
    return "memory";
  },
  readRecord: async (collection: string, key: string, schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }) => {
    const r = schema.safeParse(records.get(collection)?.get(key));
    return r.success ? r.data : null;
  },
  listRecords: async (collection: string, schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }) =>
    [...(records.get(collection)?.values() ?? [])].flatMap((v) => {
      const r = schema.safeParse(v);
      return r.success ? [r.data] : [];
    }),
}));
const proposals = new Map<string, Proposal>();
vi.mock("@/features/proposal/store", () => ({
  getProposal: async (clientId: string) => proposals.get(clientId) ?? null,
  saveProposal: async (p: Proposal) => {
    proposals.set(p.clientId, structuredClone(p));
    return "file";
  },
}));
vi.mock("@/features/workspace/model", () => ({
  loadStakeholderModel: async () => ({ url: null, boundingBox: { min: [0, 0, 0], max: [1, 1, 1] }, knownSides: ["north"] }),
}));

const base: Client[] = [
  { id: "client-a", company: "Glazing Co", role: "trade", contact: { name: "A", title: "T" }, need: "sales-and-bids", needsNotes: "bids", focusElements: ["curtain wall"] },
  { id: "client-b", company: "Temple University", role: "owner-developer", contact: { name: "B", title: "T" }, need: "community-and-pr", needsNotes: "pr", focusElements: ["terrace"] },
];
vi.mock("@/features/project/load", () => ({
  loadProject: async () => ({ slug: "demo-project", name: "Morgan Hall North", address: "", location: { lat: 0, lng: 0 }, buildingType: "", scopeType: "", timeline: "", summary: "" }),
  loadClients: async () => structuredClone(base),
}));

const proposalFor = (clientId: string, teaser: string): Proposal => ({
  clientId,
  projectSlug: "demo-project",
  status: "draft",
  pitch: { teaserLine: teaser, headline: "h", problem: "p", solution: "s", shotCaptions: [], acrossProject: "a" },
  shots: [],
});
const scenario = (summary: string) => ({ summary, role: "trade" as const, need: "recruiting" as const, needsNotes: "n", focusElements: ["curtain wall"], projectUpdate: "" });
vi.mock("@/features/proposal/scenario", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/proposal/scenario")>()),
  planScenario: async ({ client, change }: { client: Client; change: string }) => ({
    scenario: scenario(`Changed: ${change}`),
    client: { ...client, need: "recruiting" },
    proposal: proposalFor(client.id, `new pitch for ${client.id}`),
  }),
  planNewStakeholder: async ({ clientId, description }: { clientId: string; description: string }) => ({
    scenario: scenario(`New: ${description}`),
    client: { id: clientId, company: "New GC (placeholder)", role: "general-contractor", contact: { name: "P", title: "T" }, need: "documentation", needsNotes: "n", focusElements: ["terrace"] },
    proposal: proposalFor(clientId, "new stakeholder pitch"),
  }),
}));

const { createDraft, resolveDraft, DraftError } = await import("./drafts");
const { listDrafts, listProjects, loadProjectClients } = await import("./store");

beforeEach(() => {
  records.clear();
  proposals.clear();
  proposals.set("client-a", proposalFor("client-a", "reviewed a"));
  proposals.set("client-b", proposalFor("client-b", "reviewed b"));
});

describe("project drafts", () => {
  it("drafts a change without touching the live stakeholder or proposal", async () => {
    const draft = await createDraft({ projectSlug: "demo-project", change: "now hiring glaziers", clientId: "client-a" });
    expect(draft.status).toBe("pending");
    expect(draft.kind).toBe("update");
    expect(proposals.get("client-a")!.pitch.teaserLine).toBe("reviewed a");
    expect((await loadProjectClients("demo-project"))!.find((c) => c.id === "client-a")!.need).toBe("sales-and-bids");
    expect((await listDrafts("demo-project")).map((d) => d.id)).toEqual([draft.id]);
  });

  it("replace updates this project's stakeholder and proposal", async () => {
    const draft = await createDraft({ projectSlug: "demo-project", change: "now hiring", clientId: "client-a" });
    const done = await resolveDraft("demo-project", draft.id, "replace");
    expect(done.status).toBe("replaced");
    expect(proposals.get("client-a")!.pitch.teaserLine).toBe("new pitch for client-a");
    expect((await loadProjectClients("demo-project"))!.find((c) => c.id === "client-a")!.need).toBe("recruiting");
    await expect(resolveDraft("demo-project", draft.id, "discard")).rejects.toBeInstanceOf(DraftError);
  });

  it("new-project keeps this project and opens a new one with the change applied", async () => {
    const draft = await createDraft({ projectSlug: "demo-project", change: "now hiring", clientId: "client-a" });
    const done = await resolveDraft("demo-project", draft.id, "new-project");
    expect(done.status).toBe("new-project");
    expect(done.newProjectId).toBe("demo-project-2");

    // The original is untouched.
    expect(proposals.get("client-a")!.pitch.teaserLine).toBe("reviewed a");
    expect((await loadProjectClients("demo-project"))!.find((c) => c.id === "client-a")!.need).toBe("sales-and-bids");

    // The new project has every stakeholder under new ids, the changed one with the drafted pitch.
    expect((await listProjects()).map((p) => p.id)).toEqual(["demo-project", "demo-project-2"]);
    const clients = (await loadProjectClients("demo-project-2"))!;
    expect(clients.map((c) => c.id)).toEqual(["client-a-p2", "client-b-p2"]);
    expect(clients[0].need).toBe("recruiting");
    expect(proposals.get("client-a-p2")!.pitch.teaserLine).toBe("new pitch for client-a");
    expect(proposals.get("client-a-p2")!.projectSlug).toBe("demo-project-2");
    expect(proposals.get("client-b-p2")!.pitch.teaserLine).toBe("reviewed b");
  });

  it("adds a new stakeholder on replace, and on a new project alongside the others", async () => {
    const added = await createDraft({ projectSlug: "demo-project", change: "a general contractor joins" });
    expect(added.kind).toBe("new-stakeholder");
    await resolveDraft("demo-project", added.id, "replace");
    expect((await loadProjectClients("demo-project"))!.map((c) => c.id)).toEqual(["client-a", "client-b", added.clientId]);

    const another = await createDraft({ projectSlug: "demo-project", change: "an architect joins" });
    const done = await resolveDraft("demo-project", another.id, "new-project");
    expect((await loadProjectClients(done.newProjectId!))!.length).toBe(4);
  });

  it("discard changes nothing, and unknown projects or stakeholders are 404s", async () => {
    const draft = await createDraft({ projectSlug: "demo-project", change: "something", clientId: "client-b" });
    expect((await resolveDraft("demo-project", draft.id, "discard")).status).toBe("discarded");
    expect(proposals.get("client-b")!.pitch.teaserLine).toBe("reviewed b");
    await expect(createDraft({ projectSlug: "nope", change: "x".repeat(10) })).rejects.toMatchObject({ status: 404 });
    await expect(createDraft({ projectSlug: "demo-project", change: "x".repeat(10), clientId: "client-z" })).rejects.toMatchObject({ status: 404 });
    await expect(resolveDraft("demo-project", "draft-missing", "replace")).rejects.toMatchObject({ status: 404 });
  });
});

describe("new project names", () => {
  it("names the new project after the changed stakeholder and their need", async () => {
    records.clear();
    const draft = await createDraft({ projectSlug: "demo-project", change: "now hiring", clientId: "client-a" });
    await resolveDraft("demo-project", draft.id, "new-project");
    expect((await listProjects())[1].name).toBe("Morgan Hall North · Glazing Co for recruiting");
  });
});
