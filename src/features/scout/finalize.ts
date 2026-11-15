import { keepCited, remapIds, type SourceLedger } from "@/lib/agent/ledger";
import type { Source } from "@/lib/agent/schema";
import { regions } from "./regions";
import type { RegionId, ScoutCandidate, ScoutFirm } from "./schema";

/*
 * The deterministic step after extraction: whatever the model returned, only candidates that
 * cite real pages, firms the research actually names, and the region that was searched survive.
 * Pure, so it is unit-tested without a model.
 */

/** A candidate as the extraction call returns it. Id, region and state are set here, not by the model. */
export type ScoutDraft = Omit<ScoutCandidate, "id" | "region" | "state">;

/** One region's research notes and the drafts extracted from them. */
export type RegionFindings = { region: RegionId; notes: string; drafts: ScoutDraft[] };

export const SCOUT_LIMITS = { perRegion: 5, total: 20 } as const;

/** "Café 57 & The Grove!" → "cafe-57-and-the-grove" */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Stable across runs for the same project: the name, plus the city unless the name already has it. */
export function candidateId(name: string, city: string): string {
  const base = slugify(name);
  const place = slugify(city);
  const id = place && !`-${base}-`.includes(`-${place}-`) ? `${base}-${place}` : base;
  return id.slice(0, 80).replace(/-+$/, "") || "project";
}

const GENERIC_WORDS = new Set([
  "the", "a", "an", "at", "of", "on", "and",
  "project", "development", "building", "tower", "towers", "apartments", "residences",
]);

/** Name with the city, articles and generic words removed, so "The Grove Tower" ≈ "Grove". */
function nameKey(name: string, city: string): string {
  const place = slugify(city);
  let slug = `-${slugify(name)}-`;
  if (place) slug = slug.replace(`-${place}-`, "-");
  const key = slug.split("-").filter((word) => word && !GENERIC_WORDS.has(word)).join("-");
  return key || slugify(name);
}

/** Lowercase words separated by single spaces, for whole-word matching. */
function words(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const LEGAL_SUFFIX = / (inc|llc|llp|lp|pc|pllc|ltd|co|corp|corporation|company)$/;

/**
 * True when the firm's name appears as whole words in `haystack` (already passed through
 * `words`), case-insensitively. "Gilbane Building Company" also matches "Gilbane Building Co.".
 */
function mentions(haystack: string, firm: string): boolean {
  const padded = ` ${haystack} `;
  const full = words(firm);
  if (!full) return false;
  if (padded.includes(` ${full} `)) return true;
  const bare = full.replace(LEGAL_SUFFIX, "");
  return bare !== full && bare.length >= 3 && padded.includes(` ${bare} `);
}

function uniqueFirms(firms: ScoutFirm[]): ScoutFirm[] {
  const seen = new Set<string>();
  return firms.filter((firm) => {
    const key = `${words(firm.name)}|${firm.role}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Folds `loser` into `winner`: the winner keeps its facts and gains the other's sources and firms. */
function merge(winner: ScoutCandidate, loser: ScoutCandidate): ScoutCandidate {
  return {
    ...winner,
    sourceIds: [...new Set([...winner.sourceIds, ...loser.sourceIds])],
    firms: uniqueFirms([...winner.firms, ...loser.firms]),
  };
}

function ranksAbove(a: ScoutCandidate, b: ScoutCandidate): boolean {
  if (a.score !== b.score) return a.score > b.score;
  return a.sourceIds.length > b.sourceIds.length;
}

/**
 * Turns every region's drafts into the ranked candidate list and the sources they cite:
 * 1. drops drafts that cite no page in the ledger (and unknown ids from the rest);
 * 2. drops firms named neither in the region's notes nor in a title of a page the draft cites;
 * 3. sets region and state to the region researched, and a slug id from name and city;
 * 4. merges duplicates (same id, or the same name in the same city), keeping the higher score;
 * 5. sorts by score, keeps at most `perRegion` per region and `total` overall;
 * 6. keeps only the cited sources, renumbered S1, S2, ... in order of first citation.
 */
export function finalizeCandidates(
  findings: RegionFindings[],
  ledger: SourceLedger,
  limits: { perRegion: number; total: number } = SCOUT_LIMITS,
): { candidates: ScoutCandidate[]; sources: Source[] } {
  const titles = new Map(ledger.list().map((s) => [s.id, s.title]));

  const all: ScoutCandidate[] = [];
  for (const { region: regionId, notes, drafts } of findings) {
    const region = regions[regionId];
    const noteWords = words(notes);
    for (const draft of keepCited(drafts, ledger)) {
      const cited = words(draft.sourceIds.map((id) => titles.get(id) ?? "").join(" | "));
      const firms = uniqueFirms(
        draft.firms
          .map((firm) => ({ ...firm, name: firm.name.trim() }))
          .filter((firm) => mentions(noteWords, firm.name) || mentions(cited, firm.name)),
      );
      all.push({
        ...draft,
        id: candidateId(draft.name, draft.city),
        region: region.id,
        state: region.state,
        firms,
      });
    }
  }

  // Merge duplicates, keyed by id and by (near-identical name, city).
  const kept: ScoutCandidate[] = [];
  const byKey = new Map<string, number>();
  for (const candidate of all) {
    const keys = [`id:${candidate.id}`, `name:${nameKey(candidate.name, candidate.city)}|${slugify(candidate.city)}`];
    const index = keys.map((k) => byKey.get(k)).find((i) => i !== undefined);
    if (index === undefined) {
      kept.push(candidate);
      for (const k of keys) byKey.set(k, kept.length - 1);
      continue;
    }
    const existing = kept[index];
    kept[index] = ranksAbove(candidate, existing) ? merge(candidate, existing) : merge(existing, candidate);
    for (const k of keys) byKey.set(k, index);
  }

  // Highest score first; the sort is stable, so ties keep research order.
  const ranked = [...kept].sort((a, b) => (ranksAbove(a, b) ? -1 : ranksAbove(b, a) ? 1 : 0));

  const perRegion = new Map<RegionId, number>();
  const usedIds = new Set<string>();
  const capped: ScoutCandidate[] = [];
  for (const candidate of ranked) {
    if (capped.length >= limits.total) break;
    const count = perRegion.get(candidate.region) ?? 0;
    if (count >= limits.perRegion) continue;
    perRegion.set(candidate.region, count + 1);
    // Different projects whose slugs still collide get a numeric suffix.
    let id = candidate.id;
    for (let n = 2; usedIds.has(id); n++) id = `${candidate.id}-${n}`;
    usedIds.add(id);
    capped.push({ ...candidate, id });
  }

  const { sources, remap } = ledger.subset(capped.flatMap((c) => c.sourceIds));
  return { candidates: capped.map((c) => remapIds(c, remap)), sources };
}
