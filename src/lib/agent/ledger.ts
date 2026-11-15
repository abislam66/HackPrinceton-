import type { Source } from "./schema";

/*
 * The source ledger: every URL the web tools returned during a run, numbered S1, S2, ...
 * It is built only from tool-result blocks and citations, never from the model's own text,
 * so a fact that cites an id not in the ledger cites a page nobody fetched.
 */

/** "https://www.Example.com/a/?utm_source=x#top" → "https://example.com/a" (for de-duplication). */
export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "ref" || key === "fbclid" || key === "gclid") url.searchParams.delete(key);
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    const query = url.searchParams.toString();
    return `${url.protocol}//${host}${path}${query ? `?${query}` : ""}`;
  } catch {
    return raw.trim();
  }
}

export function publisherOf(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export class SourceLedger {
  private byKey = new Map<string, Source>();
  private ordered: Source[] = [];

  /** Adds a page (or returns the existing entry). Returns its id, or null for a malformed URL. */
  add(url: string, title: string | null | undefined, pageAge: string | null = null): string | null {
    if (!/^https?:\/\//i.test(url)) return null;
    const key = normalizeUrl(url);
    const existing = this.byKey.get(key);
    if (existing) {
      if ((!existing.title || existing.title === existing.publisher) && title) existing.title = title.trim();
      if (!existing.pageAge && pageAge) existing.pageAge = pageAge;
      return existing.id;
    }
    const source: Source = {
      id: `S${this.ordered.length + 1}`,
      url,
      title: title?.trim() || publisherOf(url),
      publisher: publisherOf(url),
      pageAge,
    };
    this.byKey.set(key, source);
    this.ordered.push(source);
    return source.id;
  }

  idFor(url: string): string | null {
    return this.byKey.get(normalizeUrl(url))?.id ?? null;
  }

  has(id: string): boolean {
    return this.ordered.some((s) => s.id === id);
  }

  get size(): number {
    return this.ordered.length;
  }

  list(): Source[] {
    return this.ordered.map((s) => ({ ...s }));
  }

  /** Only the sources in `ids`, renumbered in order of first citation, with a map old → new id. */
  subset(ids: Iterable<string>): { sources: Source[]; remap: Map<string, string> } {
    const remap = new Map<string, string>();
    const sources: Source[] = [];
    for (const id of ids) {
      if (remap.has(id)) continue;
      const source = this.ordered.find((s) => s.id === id);
      if (!source) continue;
      const next = `S${sources.length + 1}`;
      remap.set(id, next);
      sources.push({ ...source, id: next });
    }
    return { sources, remap };
  }

  /** The ledger as prompt text for the extraction call: "S1 | title | publisher | url". */
  toPrompt(): string {
    return this.ordered
      .map((s) => `${s.id} | ${s.title} | ${s.publisher}${s.pageAge ? ` | ${s.pageAge}` : ""} | ${s.url}`)
      .join("\n");
  }

  static from(sources: Source[]): SourceLedger {
    const ledger = new SourceLedger();
    for (const s of sources) ledger.add(s.url, s.title, s.pageAge);
    return ledger;
  }
}

/**
 * Keeps only the source ids the ledger knows. Items left with no known source are dropped by
 * `keepCited`; this one just cleans a single list.
 */
export function knownIds(ids: readonly string[], ledger: SourceLedger): string[] {
  return [...new Set(ids.filter((id) => ledger.has(id)))];
}

/** Drops every item that cites no known source and strips unknown ids from the rest. */
export function keepCited<T extends { sourceIds: string[] }>(items: readonly T[], ledger: SourceLedger): T[] {
  return items
    .map((item) => ({ ...item, sourceIds: knownIds(item.sourceIds, ledger) }))
    .filter((item) => item.sourceIds.length > 0);
}

/** Rewrites source ids through `remap` (after `subset`), dropping ids that were not kept. */
export function remapIds<T extends { sourceIds: string[] }>(item: T, remap: Map<string, string>): T {
  return { ...item, sourceIds: item.sourceIds.map((id) => remap.get(id)).filter((id): id is string => Boolean(id)) };
}
