import { beforeEach, describe, expect, it, vi } from "vitest";
import { research, type ResearchOptions } from "@/lib/agent/research";
import type { Progress } from "@/lib/agent/schema";
import { structured } from "@/lib/agent/structured";
import { runDossier } from "./dossier";
import { dossierExtractionSchema, type DossierExtraction } from "./finalize";
import { dossierSchema, type DossierTarget } from "./schema";

// No model calls in tests: both phases are mocked.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/agent/research", () => ({ research: vi.fn(), AgentError: class AgentError extends Error {} }));
vi.mock("@/lib/agent/structured", () => ({ structured: vi.fn() }));

const target: DossierTarget = {
  projectId: "demo-project",
  name: "Morgan Hall North",
  address: "1601 N Broad St",
  city: "Philadelphia",
  state: "PA",
  hints: ["27-story residence hall at Temple University"],
};

/** Each scope adds its own pages to the shared ledger, the way the real tools would. */
function fakeResearch(failScope?: string) {
  vi.mocked(research).mockImplementation(async (options: ResearchOptions) => {
    if (options.scope === failScope) throw new Error("search tool unavailable");
    const ledger = options.ledger!;
    if (options.scope === "building") {
      const id = ledger.add("https://now.temple.edu/news/morgan-hall", "Morgan Hall heralds new era at Temple");
      options.onProgress?.({ kind: "search", message: "Searching: Morgan Hall North Temple", scope: options.scope });
      return { text: `Morgan Hall North has 27 floors [${id}].`, ledger, sourceIds: id ? [id] : [], queries: [], fetched: [] };
    }
    const id = ledger.add("https://www.mgapartners.com/morgan-hall", "Morgan Hall, Temple University");
    return { text: `MGA Partners designed the tower [${id}].`, ledger, sourceIds: id ? [id] : [], queries: [], fetched: [] };
  });
}

const extraction: DossierExtraction = {
  summary: { text: "A 27-story residence hall at Temple University.", sourceIds: ["S1"] },
  keyFacts: [{ label: "Floors", value: "27", sourceIds: ["S1"] }],
  building: [],
  firms: [
    {
      name: "MGA Partners",
      role: "architect",
      scope: null,
      website: "https://www.mgapartners.com/",
      contactUrl: null,
      headquarters: null,
      sourceIds: ["S2"],
    },
  ],
  timeline: [],
};

function context() {
  const events: Progress[] = [];
  return { events, ctx: { signal: new AbortController().signal, progress: (p: Progress) => events.push(p) } };
}

beforeEach(() => {
  vi.mocked(research).mockReset();
  vi.mocked(structured).mockReset().mockResolvedValue(extraction);
});

describe("runDossier", () => {
  it("runs two research calls on one ledger, then one extraction", async () => {
    fakeResearch();
    const { events, ctx } = context();
    const dossier = await runDossier(target, ctx);

    expect(research).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(research).mock.calls.map(([options]) => options);
    expect(calls.map((c) => c.scope)).toEqual(["building", "firms"]);
    expect(calls.every((c) => c.maxSearches === 4 && c.maxFetches === 2)).toBe(true);
    expect(calls[0].ledger).toBe(calls[1].ledger);
    expect(calls[0].signal).toBe(ctx.signal);
    expect(calls[0].userLocation).toMatchObject({ city: "Philadelphia", region: "Pennsylvania", country: "US" });
    expect(calls[0].prompt).toContain("Morgan Hall North");
    expect(calls[0].prompt).toContain("27-story residence hall at Temple University");
    expect(calls[0].system).toMatch(/Today is \d{4}-\d{2}-\d{2}\./);

    expect(structured).toHaveBeenCalledTimes(1);
    const [schema, system, user, options] = vi.mocked(structured).mock.calls[0];
    expect(schema).toBe(dossierExtractionSchema);
    expect(system).toContain("Today is");
    expect(user).toContain("Morgan Hall North has 27 floors [S1]");
    expect(user).toContain("MGA Partners designed the tower [S2]");
    expect(user).toContain("S2 | Morgan Hall, Temple University | mgapartners.com");
    expect(options?.signal).toBe(ctx.signal);

    expect(dossierSchema.safeParse(dossier).success).toBe(true);
    expect(dossier.firms[0]).toMatchObject({ name: "MGA Partners", website: "https://www.mgapartners.com/" });
    expect(dossier.sources.map((s) => s.publisher)).toEqual(["now.temple.edu", "mgapartners.com"]);
    expect(dossier.missingRoles).toEqual(["owner", "general-contractor", "facade"]);
    expect(events.some((e) => e.kind === "search" && e.scope === "building")).toBe(true);
    expect(events.at(-1)?.kind).toBe("found");
  });

  it("goes on when one research call fails, and says so", async () => {
    fakeResearch("firms");
    vi.mocked(structured).mockResolvedValue({ ...extraction, firms: [] });
    const { events, ctx } = context();
    const dossier = await runDossier(target, ctx);
    expect(dossier.sources).toHaveLength(1);
    expect(events.some((e) => e.kind === "note" && e.scope === "firms" && e.message.includes("failed"))).toBe(true);
    expect(vi.mocked(structured).mock.calls[0][2]).not.toContain("## Firms and team");
  });

  it("fails when both research calls fail", async () => {
    vi.mocked(research).mockRejectedValue(new Error("ANTHROPIC_API_KEY is not set"));
    await expect(runDossier(target, context().ctx)).rejects.toThrow("ANTHROPIC_API_KEY is not set");
    expect(structured).not.toHaveBeenCalled();
  });

  it("fails when the extraction cites nothing the research returned", async () => {
    fakeResearch();
    vi.mocked(structured).mockResolvedValue({ ...extraction, summary: { text: "Made up", sourceIds: ["S9"] } });
    await expect(runDossier(target, context().ctx)).rejects.toThrow("summary");
  });
});
