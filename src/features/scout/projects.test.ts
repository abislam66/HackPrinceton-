import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dossier } from "@/features/dossier/schema";
import { viewerFormSchema } from "@/features/building-viewer/schema";
import type { ScoutCandidate, ScoutResult } from "./schema";

vi.mock("server-only", () => ({}));

// In-memory stand-in for the JSON store, so tests never write .data/.
const { records } = vi.hoisted(() => ({ records: new Map<string, unknown>() }));
vi.mock("@/lib/store/json-store", () => ({
  readRecord: async (collection: string, key: string, schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }) => {
    const value = records.get(`${collection}/${key}`);
    if (value === undefined) return null;
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : null;
  },
  writeRecord: async (collection: string, key: string, value: unknown) => {
    records.set(`${collection}/${key}`, structuredClone(value));
    return "memory";
  },
  listRecords: async (collection: string) =>
    [...records.entries()].filter(([k]) => k.startsWith(`${collection}/`)).map(([, v]) => v),
  readSnapshot: async () => null,
}));

const { addScoutedProject, getScoutedProject, listScoutedProjects } = await import("./projects");
const { viewerInputFor } = await import("./model");

function candidate(overrides: Partial<ScoutCandidate> = {}): ScoutCandidate {
  return {
    id: "the-grove-jersey-city",
    name: "The Grove",
    address: "120 Grove St",
    city: "Jersey City",
    state: "NJ",
    region: "new-jersey",
    buildingType: "32-story residential tower",
    stage: "under-construction",
    completion: "2026",
    floors: 32,
    valueUsd: 250_000_000,
    whyItFits: "Tall glass tower going up now",
    firms: [{ name: "Handel Architects", role: "architect" }],
    score: 80,
    sourceIds: ["S1"],
    ...overrides,
  };
}

function scout(candidates: ScoutCandidate[]): ScoutResult {
  return { runAt: "2026-11-15T04:00:00.000Z", regions: ["new-jersey"], candidates, sources: [] };
}

beforeEach(() => records.clear());

describe("projects added from scouting", () => {
  it("adds a candidate from the latest scout run once, keeping its own copy", async () => {
    records.set("scout/latest", scout([candidate()]));

    const first = await addScoutedProject("the-grove-jersey-city");
    expect(first.status).toBe("added");
    if (first.status !== "added") return;
    expect(first.project.id).toBe("the-grove-jersey-city");
    expect(first.project.candidate.name).toBe("The Grove");

    const again = await addScoutedProject("the-grove-jersey-city");
    expect(again).toEqual({ status: "exists", project: first.project });

    // A later scout run that no longer finds it leaves the project as it was.
    records.set("scout/latest", scout([]));
    expect(await getScoutedProject("the-grove-jersey-city")).toEqual(first.project);
    expect(await listScoutedProjects()).toEqual([first.project]);
  });

  it("refuses unknown candidates and the demo project's id", async () => {
    records.set("scout/latest", scout([candidate()]));
    expect(await addScoutedProject("nope")).toEqual({ status: "unknown-candidate" });
    expect(await addScoutedProject("demo-project")).toEqual({ status: "reserved" });
    expect(await getScoutedProject("demo-project")).toBeNull();
    expect(await getScoutedProject("../etc")).toBeNull();
  });
});

describe("viewerInputFor", () => {
  const project = { id: "the-grove-jersey-city", candidate: candidate(), addedAt: "2026-11-15T05:00:00.000Z" };

  it("fills the viewer form from the scout facts without a dossier", () => {
    const input = viewerInputFor(project, null);
    expect(input.address).toBe("120 Grove St, Jersey City, NJ");
    expect(input.buildingName).toBe("The Grove");
    expect(input.knownFacts).toBe("32-story residential tower\n32 floors above ground\nUnder construction, completion 2026");
    expect(input.notes).toBe("Tall glass tower going up now");
    expect(viewerFormSchema.safeParse(input).success).toBe(true);
  });

  it("uses the building name when there is no street address", () => {
    const input = viewerInputFor({ ...project, candidate: candidate({ address: null }) }, null);
    expect(input.address).toBe("The Grove, Jersey City, NJ");
  });

  it("adds the dossier's facts and stays inside the form's limits", () => {
    const long = "x".repeat(180);
    const dossier = {
      address: "120 Grove Street",
      summary: { text: "A 32-story glass tower.", sourceIds: ["S1"] },
      keyFacts: Array.from({ length: 6 }, (_, i) => ({ label: `Fact ${i}`, value: long, sourceIds: ["S1"] })),
      building: Array.from({ length: 12 }, (_, i) => ({ label: `Detail ${i}`, value: long, sourceIds: ["S1"] })),
    } as unknown as Dossier;
    const input = viewerInputFor(project, dossier);
    expect(input.address).toBe("120 Grove Street, Jersey City, NJ");
    expect(input.knownFacts.length).toBeLessThanOrEqual(500);
    expect(input.knownFacts.startsWith("32-story residential tower")).toBe(true);
    expect(input.notes.length).toBeLessThanOrEqual(1000);
    expect(input.notes.startsWith("A 32-story glass tower.")).toBe(true);
    expect(viewerFormSchema.safeParse(input).success).toBe(true);
  });
});
