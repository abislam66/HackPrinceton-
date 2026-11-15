import { describe, expect, it } from "vitest";
import { SourceLedger } from "@/lib/agent/ledger";
import { candidateId, finalizeCandidates, slugify, type RegionFindings, type ScoutDraft } from "./finalize";
import { scoutResultSchema } from "./schema";

function draft(overrides: Partial<ScoutDraft> = {}): ScoutDraft {
  return {
    name: "The Grove",
    address: null,
    city: "Jersey City",
    buildingType: "32-story residential tower",
    stage: "under-construction",
    completion: "2026",
    floors: 32,
    valueUsd: null,
    whyItFits: "Glass tower topping out this winter",
    firms: [],
    score: 70,
    sourceIds: ["S1"],
    ...overrides,
  };
}

/** A ledger with `count` pages, titled "Page 1", "Page 2", ... unless a title is given. */
function ledgerOf(count: number, titles: Record<number, string> = {}): SourceLedger {
  const ledger = new SourceLedger();
  for (let i = 1; i <= count; i++) ledger.add(`https://example.com/p${i}`, titles[i] ?? `Page ${i}`);
  return ledger;
}

describe("slugify and candidateId", () => {
  it("makes URL-safe slugs", () => {
    expect(slugify("Café 57 & The Grove!")).toBe("cafe-57-and-the-grove");
    expect(slugify("  Hudson’s Yard  ")).toBe("hudsons-yard");
  });

  it("adds the city unless the name already has it", () => {
    expect(candidateId("The Grove", "Jersey City")).toBe("the-grove-jersey-city");
    expect(candidateId("The Grove Jersey City", "Jersey City")).toBe("the-grove-jersey-city");
    expect(candidateId("东方", "")).toBe("project");
  });
});

describe("finalizeCandidates", () => {
  it("drops drafts that cite no known page and strips unknown ids", () => {
    const ledger = ledgerOf(2);
    const { candidates } = finalizeCandidates(
      [
        {
          region: "new-jersey",
          notes: "",
          drafts: [draft({ name: "Real", sourceIds: ["S2", "S9"] }), draft({ name: "Invented", sourceIds: ["S7"] })],
        },
      ],
      ledger,
    );
    expect(candidates.map((c) => c.name)).toEqual(["Real"]);
    expect(candidates[0].sourceIds).toEqual(["S1"]);
  });

  it("keeps only firms named in the region's notes or a cited title, case-insensitively", () => {
    const ledger = ledgerOf(2, { 1: "Suffolk tops out The Grove", 2: "Turner Construction wins bid" });
    const { candidates } = finalizeCandidates(
      [
        {
          region: "new-jersey",
          notes: "Some say it is the tallest yet. Designed by HANDEL ARCHITECTS. Built by Gilbane Building Co. [S1]",
          drafts: [
            draft({
              sourceIds: ["S1"],
              firms: [
                { name: "Handel Architects", role: "architect" },
                { name: "handel architects", role: "architect" },
                { name: "Suffolk", role: "general-contractor" },
                { name: "Gilbane Building Company", role: "construction-manager" },
                // Only in a page this draft does not cite.
                { name: "Turner Construction", role: "general-contractor" },
                // "SOM" must not match inside "some".
                { name: "SOM", role: "architect" },
                { name: "Invented Facades LLC", role: "facade" },
              ],
            }),
          ],
        },
      ],
      ledger,
    );
    expect(candidates[0].firms).toEqual([
      { name: "Handel Architects", role: "architect" },
      { name: "Suffolk", role: "general-contractor" },
      { name: "Gilbane Building Company", role: "construction-manager" },
    ]);
  });

  it("forces region and state to the region researched", () => {
    const { candidates } = finalizeCandidates(
      [{ region: "philadelphia-main-line", notes: "", drafts: [draft({ name: "Radnor Labs", city: "Wayne" })] }],
      ledgerOf(1),
    );
    expect(candidates[0]).toMatchObject({ id: "radnor-labs-wayne", region: "philadelphia-main-line", state: "PA" });
  });

  it("merges duplicates and near-duplicate names, keeping the higher score and both sources", () => {
    const findings: RegionFindings[] = [
      {
        region: "new-york",
        notes: "Handel Architects",
        drafts: [
          draft({ name: "The Grove", score: 60, sourceIds: ["S1"], firms: [{ name: "Handel Architects", role: "architect" }] }),
        ],
      },
      {
        region: "new-jersey",
        notes: "Suffolk",
        drafts: [
          draft({ name: "Grove Tower", score: 80, sourceIds: ["S2"], firms: [{ name: "Suffolk", role: "general-contractor" }] }),
          draft({ name: "The Grove", city: "Boston", score: 50, sourceIds: ["S3"] }),
        ],
      },
    ];
    const { candidates } = finalizeCandidates(findings, ledgerOf(3));
    expect(candidates.map((c) => [c.id, c.region, c.score])).toEqual([
      ["grove-tower-jersey-city", "new-jersey", 80],
      ["the-grove-boston", "new-jersey", 50],
    ]);
    expect(candidates[0].firms.map((f) => f.name).sort()).toEqual(["Handel Architects", "Suffolk"]);
    expect(candidates[0].sourceIds).toHaveLength(2);
  });

  it("sorts by score and caps at 5 per region and 20 overall", () => {
    const regionIds = ["new-york", "philadelphia-main-line", "connecticut", "boston", "new-jersey"] as const;
    const ledger = ledgerOf(40);
    let page = 0;
    const findings: RegionFindings[] = regionIds.map((region, r) => ({
      region,
      notes: "",
      drafts: Array.from({ length: 7 }, (_, i) => draft({
        name: `Project ${r}-${i}`,
        city: region,
        score: 90 - i * 5 - r,
        sourceIds: [`S${(page++ % 40) + 1}`],
      })),
    }));
    const { candidates } = finalizeCandidates(findings, ledger);
    expect(candidates).toHaveLength(20);
    for (const region of regionIds) {
      expect(candidates.filter((c) => c.region === region).length).toBeLessThanOrEqual(5);
    }
    const scores = candidates.map((c) => c.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(new Set(candidates.map((c) => c.id)).size).toBe(20);
  });

  it("keeps only cited sources, renumbered in order of first citation", () => {
    const ledger = ledgerOf(5);
    const { candidates, sources } = finalizeCandidates(
      [
        {
          region: "boston",
          notes: "",
          drafts: [
            draft({ name: "Lab One", city: "Cambridge", score: 90, sourceIds: ["S4", "S2"] }),
            draft({ name: "Tower Two", city: "Boston", score: 80, sourceIds: ["S2", "S5"] }),
          ],
        },
      ],
      ledger,
    );
    expect(sources.map((s) => [s.id, s.url])).toEqual([
      ["S1", "https://example.com/p4"],
      ["S2", "https://example.com/p2"],
      ["S3", "https://example.com/p5"],
    ]);
    expect(candidates.map((c) => c.sourceIds)).toEqual([["S1", "S2"], ["S2", "S3"]]);
    expect(
      scoutResultSchema.safeParse({ runAt: new Date().toISOString(), regions: ["boston"], candidates, sources }).success,
    ).toBe(true);
  });
});
