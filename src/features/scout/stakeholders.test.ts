import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dossier } from "@/features/dossier/schema";
import type { ScoutedProject } from "./projects";

vi.mock("server-only", () => ({}));

const projects = new Map<string, ScoutedProject>();
const dossiers = new Map<string, Dossier>();

vi.mock("./projects", () => ({ getScoutedProject: async (id: string) => projects.get(id) ?? null }));
vi.mock("@/features/dossier/load", () => ({
  loadDossier: async (id: string) => (dossiers.has(id) ? { source: "store", data: dossiers.get(id) } : null),
}));

const { scoutedProjectFacts, scoutedStakeholders } = await import("./stakeholders");

const ID = "8-carlisle-new-york";

function project(stage: ScoutedProject["candidate"]["stage"] = "under-construction"): ScoutedProject {
  return {
    id: ID,
    addedAt: "2026-11-15T00:00:00.000Z",
    candidate: {
      id: ID,
      name: "8 Carlisle",
      address: "8 Carlisle Street",
      city: "New York",
      state: "NY",
      region: "new-york",
      buildingType: "residential tower",
      stage,
      completion: null,
      floors: 64,
      valueUsd: null,
      whyItFits: "64-story tower",
      firms: [
        { name: "Handel Architects", role: "architect" },
        { name: "Grubb Properties", role: "developer" },
      ],
      score: 86,
      sourceIds: ["S1"],
    },
  };
}

function firm(name: string, role: Dossier["firms"][number]["role"], scope: string | null = null): Dossier["firms"][number] {
  return { name, role, scope, website: null, contactUrl: null, headquarters: null, sourceIds: ["S1"] };
}

function dossier(firms: Dossier["firms"]): Dossier {
  return {
    projectId: ID,
    projectName: "8 Carlisle",
    address: "8 Carlisle St, New York, NY 10006",
    runAt: "2026-11-15T00:00:00.000Z",
    summary: { text: "A 64-story tower in the Financial District.", sourceIds: ["S1"] },
    keyFacts: [],
    building: [],
    firms,
    missingRoles: [],
    timeline: [],
    sources: [],
  };
}

beforeEach(() => {
  projects.clear();
  dossiers.clear();
});

describe("scoutedStakeholders", () => {
  it("is null for a project that wasn't added from scouting", async () => {
    expect(await scoutedStakeholders("demo-project")).toBeNull();
  });

  it("uses the firms scouting named until the dossier is researched", async () => {
    projects.set(ID, project());
    const clients = await scoutedStakeholders(ID);
    expect(clients?.map((c) => [c.company, c.role])).toEqual([
      ["Grubb Properties", "owner-developer"],
      ["Handel Architects", "architect"],
    ]);
  });

  it("uses the dossier's firms once researched: owners and builders first, one per company, ids unique to the project", async () => {
    projects.set(ID, project());
    dossiers.set(
      ID,
      dossier([
        firm("Handel Architects", "architect"),
        firm("Enclos", "facade", "Curtain wall."),
        firm("Consigli Construction", "general-contractor"),
        firm("Grubb Properties", "developer"),
        firm("Grubb Properties", "owner"),
      ]),
    );
    const clients = (await scoutedStakeholders(ID)) ?? [];
    expect(clients.map((c) => c.company)).toEqual(["Grubb Properties", "Consigli Construction", "Handel Architects", "Enclos"]);
    expect(clients.map((c) => c.id)).toContain(`consigli-construction-${ID}`);
    const enclos = clients.find((c) => c.company === "Enclos");
    expect(enclos).toMatchObject({ role: "trade", need: "sales-and-bids", focusElements: ["the curtain wall and facade details"] });
    expect(enclos?.needsNotes).toContain("Its part: Curtain wall.");
  });

  it("gives builders documentation while it's going up, and bids once it's done", async () => {
    projects.set(ID, project("under-construction"));
    dossiers.set(ID, dossier([firm("Consigli Construction", "construction-manager")]));
    expect((await scoutedStakeholders(ID))?.[0]).toMatchObject({ role: "general-contractor", need: "documentation" });

    projects.set(ID, project("completed"));
    expect((await scoutedStakeholders(ID))?.[0]).toMatchObject({ need: "sales-and-bids" });
  });
});

describe("scoutedProjectFacts", () => {
  it("reads the candidate, with the dossier's summary and address once researched", async () => {
    projects.set(ID, project());
    expect(await scoutedProjectFacts(ID)).toMatchObject({ slug: ID, name: "8 Carlisle", address: "8 Carlisle Street, New York, NY" });

    dossiers.set(ID, dossier([]));
    expect(await scoutedProjectFacts(ID)).toMatchObject({
      address: "8 Carlisle St, New York, NY 10006",
      summary: "A 64-story tower in the Financial District.",
    });
  });
});
