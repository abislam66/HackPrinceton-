import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScoutCandidate, ScoutResult } from "@/features/scout/schema";
import { readRecord, readSnapshot } from "@/lib/store/json-store";
import { dossierTargetSchema } from "./schema";
import { resolveTarget } from "./target";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/store/json-store", () => ({ readRecord: vi.fn(), readSnapshot: vi.fn() }));

function candidate(overrides: Partial<ScoutCandidate>): ScoutCandidate {
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
    firms: [
      { name: "Handel Architects", role: "architect" },
      { name: "Hollister Construction", role: "general-contractor" },
    ],
    score: 80,
    sourceIds: ["S1"],
    ...overrides,
  };
}

function scoutResult(candidates: ScoutCandidate[]): ScoutResult {
  return { runAt: "2026-11-14T12:00:00.000Z", regions: ["new-jersey"], candidates, sources: [] };
}

beforeEach(() => {
  vi.mocked(readRecord).mockReset().mockResolvedValue(null);
  vi.mocked(readSnapshot).mockReset().mockResolvedValue(null);
});

describe("resolveTarget", () => {
  it("builds the demo project's target from project.json", async () => {
    const target = await resolveTarget("demo-project");
    expect(target).toMatchObject({
      projectId: "demo-project",
      name: "Morgan Hall North",
      address: "1601 N Broad St",
      city: "Philadelphia",
      state: "PA",
    });
    expect(dossierTargetSchema.safeParse(target).success).toBe(true);
    expect(target!.hints.length).toBeGreaterThan(0);
    expect(target!.hints.length).toBeLessThanOrEqual(4);
    expect(target!.hints.every((h) => h.length > 0 && h.length <= 200)).toBe(true);
    expect(target!.hints.join(" ")).toContain("Temple University");
    expect(readRecord).not.toHaveBeenCalled();
  });

  it("finds a scout candidate in the stored scout run first", async () => {
    vi.mocked(readRecord).mockResolvedValue(scoutResult([candidate({})]));
    const target = await resolveTarget("the-grove-jersey-city");
    expect(readRecord).toHaveBeenCalledWith("scout", "latest", expect.anything());
    expect(readSnapshot).not.toHaveBeenCalled();
    expect(target).toMatchObject({
      projectId: "the-grove-jersey-city",
      name: "The Grove",
      address: "120 Grove St",
      city: "Jersey City",
      state: "NJ",
    });
    expect(target!.hints).toEqual([
      "32-story residential tower",
      "Stage: under construction, completion 2026",
      "32 floors",
      "Reported cost: $250 million",
      "Architect: Handel Architects",
      "General contractor: Hollister Construction",
    ]);
  });

  it("falls back to the committed scout snapshot", async () => {
    vi.mocked(readRecord).mockResolvedValue(scoutResult([candidate({ id: "other-tower" })]));
    vi.mocked(readSnapshot).mockResolvedValue(
      scoutResult([candidate({ address: null, floors: null, valueUsd: null, completion: null, firms: [] })]),
    );
    const target = await resolveTarget("the-grove-jersey-city");
    expect(readSnapshot).toHaveBeenCalledWith("src/features/scout/snapshot/latest.json", expect.anything());
    expect(target).toMatchObject({ address: null, hints: ["32-story residential tower", "Stage: under construction"] });
  });

  it("returns null for an unknown or malformed id", async () => {
    expect(await resolveTarget("nowhere")).toBeNull();
    expect(await resolveTarget("../etc/passwd")).toBeNull();
    expect(await resolveTarget("")).toBeNull();
  });
});
