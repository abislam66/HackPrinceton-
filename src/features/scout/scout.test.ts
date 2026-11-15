import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceLedger } from "@/lib/agent/ledger";
import type { ResearchOptions } from "@/lib/agent/research";
import type { Progress } from "@/lib/agent/schema";

// The runtime modules are server-only; under vitest there is no React server to check for.
vi.mock("server-only", () => ({}));

const research = vi.fn();
const structured = vi.fn();
let hasKey = true;

vi.mock("@/lib/agent/research", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent/research")>()),
  hasAnthropicKey: () => hasKey,
  research: (options: ResearchOptions) => research(options),
}));
vi.mock("@/lib/agent/structured", () => ({
  structured: (...args: unknown[]) => structured(...args),
}));

const { runScout } = await import("./scout");
const { regions } = await import("./regions");
const { AgentError } = await import("@/lib/agent/research");
const { scoutResultSchema } = await import("./schema");

/** Fake research: two pages per region in the shared ledger, notes citing the first. */
function fakeResearch(options: ResearchOptions) {
  const ledger = options.ledger as SourceLedger;
  const scope = options.scope!;
  const cited = ledger.add(`https://press.example/${scope}/tower`, `${scope} tower tops out, Suffolk builds`);
  const other = ledger.add(`https://press.example/${scope}/other`, `${scope} other story`);
  options.onProgress?.({ kind: "search", message: `Searching: towers in ${scope}` });
  return Promise.resolve({
    text: `${scope} Tower is a 40-story tower by Handel Architects. [${cited}]`,
    ledger,
    sourceIds: [cited, other].filter((id): id is string => Boolean(id)),
    queries: [],
    fetched: [],
  });
}

/** Fake extraction: one candidate per region, citing every id in the prompt's source list. */
function fakeStructured(_schema: unknown, _system: string, user: string) {
  const label = /^Region: (.+)$/m.exec(user)![1];
  const region = Object.values(regions).find((r) => r.label === label)!;
  const sourceIds = [...user.matchAll(/^(S\d+) \|/gm)].map((m) => m[1]);
  return Promise.resolve({
    candidates: [
      {
        name: `${region.id} Tower`,
        address: null,
        city: region.cities[0],
        buildingType: "40-story residential tower",
        stage: "topped-out",
        completion: "2026",
        floors: 40,
        valueUsd: 300_000_000,
        whyItFits: "Tall glass tower",
        firms: [
          { name: "Handel Architects", role: "architect" },
          { name: "Suffolk", role: "general-contractor" },
          { name: "Made Up Builders", role: "general-contractor" },
        ],
        score: 80,
        sourceIds,
      },
    ],
  });
}

describe("runScout", () => {
  beforeEach(() => {
    hasKey = true;
    research.mockImplementation(fakeResearch);
    structured.mockImplementation(fakeStructured);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T15:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    research.mockReset();
    structured.mockReset();
  });

  it("researches every region into one ledger and returns a valid, cited result", async () => {
    const events: Progress[] = [];
    const result = await runScout({ progress: (p) => events.push(p) });

    expect(research).toHaveBeenCalledTimes(5);
    const calls = research.mock.calls.map(([options]) => options as ResearchOptions);
    expect(new Set(calls.map((c) => c.ledger)).size).toBe(1);
    for (const call of calls) {
      expect(call).toMatchObject({ maxSearches: 5, maxFetches: 0 });
      expect(call.prompt).toContain("Today is 2026-11-14");
      expect(call.userLocation).toEqual(regions[call.scope as keyof typeof regions].userLocation);
    }

    // Each extraction sees its own region's pages (cited or not), never another region's.
    for (const [, , user] of structured.mock.calls as [unknown, string, string][]) {
      const urls = [...user.matchAll(/https:\/\/press\.example\/([a-z-]+)\//g)].map((m) => m[1]);
      expect(urls).toHaveLength(2);
      expect(new Set(urls).size).toBe(1);
      expect(user).toContain("Today is 2026-11-14");
    }

    expect(scoutResultSchema.safeParse(result).success).toBe(true);
    expect(result.regions).toHaveLength(5);
    expect(result.candidates).toHaveLength(5);
    // The fake extraction cites every page it is shown: two per region.
    expect(result.sources).toHaveLength(10);
    expect(result.candidates.find((c) => c.region === "boston")).toMatchObject({ state: "MA", city: "Boston" });
    for (const candidate of result.candidates) {
      expect(candidate.firms.map((f) => f.name)).toEqual(["Handel Architects", "Suffolk"]);
    }

    const found = events.filter((e) => e.kind === "found").map((e) => e.message);
    expect(found).toContain("Found 1 project in New Jersey");
    expect(events.find((e) => e.kind === "found")?.scope).toBeDefined();
  });

  it("scouts only the regions asked for", async () => {
    const result = await runScout({ regions: ["connecticut", "connecticut"] });
    expect(research).toHaveBeenCalledTimes(1);
    expect(result.regions).toEqual(["connecticut"]);
    expect(result.candidates[0]).toMatchObject({ region: "connecticut", state: "CT" });
  });

  it("reports a failed region as a note and keeps the others", async () => {
    research.mockImplementation((options: ResearchOptions) =>
      options.scope === "boston" ? Promise.reject(new AgentError("Research call failed: overloaded")) : fakeResearch(options),
    );
    const events: Progress[] = [];
    const result = await runScout({ progress: (p) => events.push(p) });

    expect(result.regions).not.toContain("boston");
    expect(result.candidates).toHaveLength(4);
    expect(events).toContainEqual({
      kind: "note",
      message: "Could not scout Greater Boston: Research call failed: overloaded",
      scope: "boston",
    });
  });

  it("throws when every region fails", async () => {
    structured.mockRejectedValue(new AgentError("Extraction call failed: overloaded"));
    await expect(runScout()).rejects.toThrow(/every region/);
  });

  it("throws before researching when there is no API key", async () => {
    hasKey = false;
    await expect(runScout()).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(research).not.toHaveBeenCalled();
  });
});
