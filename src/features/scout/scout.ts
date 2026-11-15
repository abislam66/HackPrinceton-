import "server-only";
import { z } from "zod";
import { SourceLedger } from "@/lib/agent/ledger";
import { AgentAbortedError, AgentError, hasAnthropicKey, research } from "@/lib/agent/research";
import type { ProgressFn, Source } from "@/lib/agent/schema";
import { structured } from "@/lib/agent/structured";
import { finalizeCandidates, SCOUT_LIMITS, type RegionFindings } from "./finalize";
import { regions, stateNames, type Region } from "./regions";
import { regionIds, scoutCandidateSchema, type RegionId, type ScoutResult } from "./schema";

/*
 * A scout run: every region researched in parallel (web search only, ~4 searches each) into one
 * shared source ledger, then one extraction call per region, then the deterministic
 * finalizeCandidates step. A region that fails is reported in the feed; the run fails only
 * when every region does.
 */

const SEARCHES_PER_REGION = 5;
/** Asked of extraction: a few more than the per-region cap, so finalize can pick the best. */
const DRAFTS_PER_REGION = 6;

// No .max() on the array: structured outputs cannot enforce it, so an extra item would fail the
// parse and cost a retry. finalizeCandidates caps the list instead.
const extractionSchema = z.object({
  candidates: z.array(scoutCandidateSchema.omit({ id: true, region: true, state: true })),
});

const RESEARCH_SYSTEM = `You scout construction projects for Tradesmark, which films and documents construction and sells that footage to the firms building it: general contractors, architects, owners and developers, facade and curtain-wall trades.
Use web search to find real, notable projects. Report only what the results say. Name every firm the sources name, with its role. Never guess a firm, a cost, a floor count or a date.`;

const EXTRACT_SYSTEM = `You turn a scout's research notes into candidate projects for Tradesmark, which films construction projects for the firms building them.
Use only facts in the notes. Each candidate cites the source ids (S1, S2, ...) that back it, taken only from the source list. Use null when the notes do not give a value. List a firm only if the notes name it.
Score Tradesmark fit from 0 to 100: scale (floors, cost), facade and visual interest, how many firms are named, and recency (under construction or just topped out ranks above long finished).`;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function researchPrompt(region: Region, today: string): string {
  const press = region.press.map((p) => `${p.name} (${p.domain})`).join(", ");
  return `Today is ${today}. Find notable construction projects in ${region.label}, ${stateNames[region.state]}: ${region.cities.join(", ")}.
They must be under construction, topped out, or completed since 2024. Notable means about 8+ floors or $50M+, or architecturally distinctive (facade, curtain wall, form), with the developer, architect, general contractor or facade firm named.
Lean on the regional trade press: ${press}. Make each search different (towers, lab and office, hospital, campus, cultural, mixed use).
Then write short notes on 4 to 8 projects in ${stateNames[region.state]} only: name, address, city, building type, stage, completion, floors, cost, and every named firm with its role.`;
}

function extractPrompt(region: Region, today: string, notes: string, sources: Source[]): string {
  const lines = sources
    .map((s) => `${s.id} | ${s.title} | ${s.publisher}${s.pageAge ? ` | ${s.pageAge}` : ""} | ${s.url}`)
    .join("\n");
  return `Today is ${today}.
Region: ${region.label}
Keep up to ${DRAFTS_PER_REGION} projects in ${stateNames[region.state]} that are under construction, topped out, or completed since 2024, and notable (about 8+ floors, $50M+, or architecturally distinctive). Skip the rest.
city is the city or town alone. stage is under-construction, topped-out or completed. valueUsd is whole dollars. whyItFits is one line from the facts, e.g. "38-story glass tower topping out this winter; Handel Architects, Suffolk".

<sources>
${lines}
</sources>

<notes>
${notes}
</notes>`;
}

/** The ledger ids the notes cite with "[S3]"-style markers. */
function citedIds(notes: string): Set<string> {
  return new Set([...notes.matchAll(/\bS\d+\b/g)].map((m) => m[0]));
}

async function scoutRegion(
  region: Region,
  ledger: SourceLedger,
  today: string,
  signal: AbortSignal | undefined,
  progress: ProgressFn,
): Promise<RegionFindings> {
  const notes = await research({
    system: RESEARCH_SYSTEM,
    prompt: researchPrompt(region, today),
    maxSearches: SEARCHES_PER_REGION,
    maxFetches: 0,
    userLocation: region.userLocation,
    scope: region.id,
    ledger,
    signal,
    onProgress: progress,
  });
  if (!notes.text) throw new AgentError("the research came back empty");

  // The ledger is shared with the other regions; show extraction only this region's pages:
  // everything its searches returned, plus anything its notes cite.
  const own = new Set([...notes.sourceIds, ...citedIds(notes.text)]);
  const sources = ledger.list().filter((s) => own.has(s.id));
  const { candidates } = await structured(
    extractionSchema,
    EXTRACT_SYSTEM,
    extractPrompt(region, today, notes.text, sources.length ? sources : ledger.list()),
    { signal, maxTokens: 8000 },
  );

  const found = Math.min(candidates.filter((c) => c.sourceIds.some((id) => ledger.has(id))).length, SCOUT_LIMITS.perRegion);
  progress({
    kind: "found",
    message: `Found ${found} ${found === 1 ? "project" : "projects"} in ${region.label}`,
    scope: region.id,
  });
  return { region: region.id, notes: notes.text, drafts: candidates };
}

export type ScoutOptions = {
  /** Regions to scout. Defaults to all five. */
  regions?: readonly RegionId[];
  signal?: AbortSignal;
  progress?: ProgressFn;
};

export async function runScout({ regions: wanted = regionIds, signal, progress = () => {} }: ScoutOptions = {}): Promise<ScoutResult> {
  if (!hasAnthropicKey()) throw new AgentError("ANTHROPIC_API_KEY is not set");
  const selected = [...new Set(wanted)].map((id) => regions[id]);
  if (!selected.length) throw new AgentError("No regions to scout");

  const today = isoDay(new Date());
  const ledger = new SourceLedger();
  progress({ kind: "note", message: `Scouting ${selected.map((r) => r.label).join(", ")}` });

  const settled = await Promise.all(
    selected.map((region) =>
      scoutRegion(region, ledger, today, signal, progress).catch((error: unknown) => {
        const reason = signal?.aborted ? "ran out of time" : error instanceof Error ? error.message : String(error);
        progress({ kind: "note", message: `Could not scout ${region.label}: ${reason}`, scope: region.id });
        return error instanceof Error ? error : new Error(String(error));
      }),
    ),
  );

  const findings = settled.filter((s): s is RegionFindings => !(s instanceof Error));
  if (!findings.length) {
    if (signal?.aborted) throw new AgentAbortedError("The run passed its deadline");
    const first = settled.find((s): s is Error => s instanceof Error);
    throw new AgentError(`Scouting failed in every region${first ? ` (${first.message})` : ""}`);
  }

  const { candidates, sources } = finalizeCandidates(findings, ledger);
  progress({ kind: "note", message: `Ranked ${candidates.length} projects from ${sources.length} sources` });
  return {
    runAt: new Date().toISOString(),
    regions: findings.map((f) => f.region),
    candidates,
    sources,
  };
}
