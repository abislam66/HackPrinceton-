import { z } from "zod";
import { keepCited, publisherOf, remapIds, type SourceLedger } from "@/lib/agent/ledger";
import { firmRoles, type FirmRole } from "@/lib/agent/schema";
import {
  dossierSchema,
  type Dossier,
  type DossierEvent,
  type DossierFact,
  type DossierFirm,
  type DossierTarget,
} from "./schema";

/*
 * The pure step between the extraction call and the stored dossier. The model's output is only
 * a proposal: everything here is checked against what the web tools actually returned (the
 * ledger) and what the research notes actually say, so an uncited fact, an unnamed firm or an
 * invented URL never reaches the screen.
 */

/**
 * What the extraction call returns. Looser than the contract on purpose (plain strings for URLs,
 * no minimum lengths) so a near-miss reply is cleaned up here instead of failing the call.
 */
const ledgerIds = z.array(z.string()).describe('Ledger ids that back this item, e.g. ["S2", "S7"]');

const extractedFact = z.object({ label: z.string(), value: z.string(), sourceIds: ledgerIds });

export const dossierExtractionSchema = z.object({
  summary: z.object({ text: z.string(), sourceIds: ledgerIds }),
  keyFacts: z.array(extractedFact),
  building: z.array(extractedFact),
  firms: z.array(
    z.object({
      name: z.string(),
      role: z.enum(firmRoles),
      scope: z.string().nullable(),
      website: z.string().nullable(),
      contactUrl: z.string().nullable(),
      headquarters: z.string().nullable(),
      sourceIds: ledgerIds,
    }),
  ),
  timeline: z.array(z.object({ when: z.string(), what: z.string(), sourceIds: ledgerIds })),
});
export type DossierExtraction = z.infer<typeof dossierExtractionSchema>;

/** Key roles the screen reports as missing when no source confirms them, in display order. */
export const KEY_ROLES = ["owner", "architect", "general-contractor", "facade"] as const satisfies readonly FirmRole[];

export class DossierError extends Error {}

export type FinalizeInput = {
  target: DossierTarget;
  extraction: DossierExtraction;
  /** The research notes, with their [S#] markers. */
  notes: string;
  ledger: SourceLedger;
  runAt: Date;
};

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;
const CORPORATE_SUFFIX = /(?:\s+(?:inc|llc|llp|ltd|co|corp|corporation|company|pc|pllc|pa))+$/;

/** True when text carries an email address or a phone number. Those never go in a dossier. */
export function hasPersonalContact(text: string): boolean {
  return EMAIL.test(text) || PHONE.test(text);
}

/** Lowercase words only: "MGA Partners, Inc." → "mga partners inc". */
function words(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A firm's name as matched against notes and titles: words, without "Inc", "LLC" and the like. */
export function firmKey(name: string): string {
  return words(name).replace(CORPORATE_SUFFIX, "").trim();
}

/** Whole-word, case-insensitive: "OLIN" is in "landscaped by OLIN" but not in "Caroline". */
function mentions(haystack: string, name: string): boolean {
  const needle = firmKey(name);
  if (!needle) return false;
  return ` ${words(haystack)} `.includes(` ${needle} `);
}

function clean(text: string | null | undefined): string | null {
  const value = text?.replace(/\s+/g, " ").trim();
  return value ? value : null;
}

/**
 * Keeps a firm URL only when it is http(s) and either its host is one the web tools returned or
 * the notes quote it verbatim. Anything else may be invented, so it becomes null.
 */
export function verifiedUrl(raw: string | null, ledger: SourceLedger, notes: string): string | null {
  const value = clean(raw);
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname || url.username || url.password) return null;
  // Same site as a page the tools returned ("temple.edu" when "now.temple.edu" was found), or the
  // notes name the site. A made-up domain matches neither.
  const site = siteOf(publisherOf(value));
  if (ledger.list().some((source) => siteOf(source.publisher) === site)) return value;
  return notes.includes(value) || notes.toLowerCase().includes(site) ? value : null;
}

/** "now.temple.edu" → "temple.edu". Good enough for the US firms and institutions a dossier names. */
export function siteOf(host: string): string {
  return host.split(".").slice(-2).join(".");
}

function cleanFacts(items: DossierExtraction["keyFacts"], ledger: SourceLedger): DossierFact[] {
  return keepCited(
    items.flatMap((item) => {
      const label = clean(item.label);
      const value = clean(item.value);
      if (!label || !value || hasPersonalContact(`${label} ${value}`)) return [];
      return [{ label, value, sourceIds: item.sourceIds }];
    }),
    ledger,
  );
}

function cleanTimeline(items: DossierExtraction["timeline"], ledger: SourceLedger): DossierEvent[] {
  return keepCited(
    items.flatMap((item) => {
      const when = clean(item.when);
      const what = clean(item.what);
      if (!when || !what || hasPersonalContact(`${when} ${what}`)) return [];
      return [{ when, what, sourceIds: item.sourceIds }];
    }),
    ledger,
  );
}

function cleanFirms(items: DossierExtraction["firms"], ledger: SourceLedger, notes: string): DossierFirm[] {
  const titles = new Map(ledger.list().map((source) => [source.id, source.title]));
  const merged = new Map<string, DossierFirm>();

  for (const firm of keepCited(items, ledger)) {
    const name = clean(firm.name);
    if (!name || hasPersonalContact(name)) continue;
    // A firm must be named by the research itself, not only by the extraction call.
    const citedTitles = firm.sourceIds.map((id) => titles.get(id) ?? "").join(" \n ");
    if (!mentions(notes, name) && !mentions(citedTitles, name)) continue;

    const scope = clean(firm.scope);
    const headquarters = clean(firm.headquarters);
    const next: DossierFirm = {
      name,
      role: firm.role,
      scope: scope && !hasPersonalContact(scope) ? scope : null,
      website: verifiedUrl(firm.website, ledger, notes),
      contactUrl: verifiedUrl(firm.contactUrl, ledger, notes),
      headquarters: headquarters && !hasPersonalContact(headquarters) ? headquarters : null,
      sourceIds: firm.sourceIds,
    };

    // One entry per firm and role: a firm can hold two roles, but not the same one twice.
    const key = `${firmKey(name)}|${firm.role}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, next);
      continue;
    }
    merged.set(key, {
      ...existing,
      scope: existing.scope ?? next.scope,
      website: existing.website ?? next.website,
      contactUrl: existing.contactUrl ?? next.contactUrl,
      headquarters: existing.headquarters ?? next.headquarters,
      sourceIds: [...new Set([...existing.sourceIds, ...next.sourceIds])],
    });
  }
  return [...merged.values()];
}

/** "1601 N Broad St" + Philadelphia + PA → "1601 N Broad St, Philadelphia, PA". */
export function fullAddress(target: DossierTarget, building: DossierFact[]): string | null {
  const street = clean(target.address) ?? clean(building.find((f) => /^address$/i.test(f.label))?.value);
  if (!street) return null;
  const parts = [street];
  if (target.city && !street.toLowerCase().includes(target.city.toLowerCase())) parts.push(target.city);
  const state = target.state?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (target.state && state && !new RegExp(`\\b${state}\\b`, "i").test(street)) parts.push(target.state);
  return parts.join(", ");
}

export function missingRoles(firms: readonly Pick<DossierFirm, "role">[]): FirmRole[] {
  const present = new Set<FirmRole>(firms.map((f) => f.role));
  // A construction manager builds the job, so it answers "who built it" as well as a GC does.
  if (present.has("construction-manager")) present.add("general-contractor");
  return KEY_ROLES.filter((role) => !present.has(role));
}

/**
 * Turns the extraction into the stored dossier: keeps only cited items, drops firms the research
 * never named, nulls unverifiable URLs, computes the missing key roles and renumbers the sources
 * so `sources` holds only the pages the dossier cites.
 */
export function finalizeDossier({ target, extraction, notes, ledger, runAt }: FinalizeInput): Dossier {
  const summaryText = clean(extraction.summary.text);
  const [summary] = summaryText ? keepCited([{ text: summaryText, sourceIds: extraction.summary.sourceIds }], ledger) : [];
  if (!summary) throw new DossierError("The dossier summary cites no source the research returned");

  const keyFacts = cleanFacts(extraction.keyFacts, ledger);
  const building = cleanFacts(extraction.building, ledger);
  const firms = cleanFirms(extraction.firms, ledger, notes);
  const timeline = cleanTimeline(extraction.timeline, ledger);

  // Renumber in order of first citation, top of the screen down.
  const cited = [summary, ...keyFacts, ...building, ...firms, ...timeline].flatMap((item) => item.sourceIds);
  const { sources, remap } = ledger.subset(cited);

  const result = dossierSchema.safeParse({
    projectId: target.projectId,
    projectName: target.name,
    address: fullAddress(target, building),
    runAt: runAt.toISOString(),
    summary: remapIds(summary, remap),
    keyFacts: keyFacts.map((f) => remapIds(f, remap)),
    building: building.map((f) => remapIds(f, remap)),
    firms: firms.map((f) => remapIds(f, remap)),
    missingRoles: missingRoles(firms),
    timeline: timeline.map((e) => remapIds(e, remap)),
    sources,
  });
  if (!result.success) throw new DossierError(`The dossier does not match its schema: ${result.error.message}`);
  return result.data;
}
