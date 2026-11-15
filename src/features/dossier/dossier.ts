import "server-only";
import { SourceLedger } from "@/lib/agent/ledger";
import { AgentError, research, type ResearchResult } from "@/lib/agent/research";
import type { RunContext } from "@/lib/agent/run";
import { firmRoles } from "@/lib/agent/schema";
import { structured } from "@/lib/agent/structured";
import { dossierExtractionSchema, finalizeDossier } from "./finalize";
import type { Dossier, DossierTarget } from "./schema";

/*
 * A live dossier run: two research calls in parallel on one source ledger (the building and its
 * timeline; the firms and their websites), then one extraction into the dossier, checked by
 * finalizeDossier against what the web tools actually returned.
 */

const STATE_NAMES: Record<string, string> = {
  NY: "New York",
  PA: "Pennsylvania",
  CT: "Connecticut",
  MA: "Massachusetts",
  NJ: "New Jersey",
};

/** "2026-11-14", in the Northeast's time zone so a late-evening run does not say tomorrow. */
function today(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function place(target: DossierTarget): string {
  return [target.address, target.city, target.state].filter(Boolean).join(", ") || "not given";
}

function briefing(target: DossierTarget): string {
  const hints = target.hints.length ? target.hints.map((h) => `- ${h}`).join("\n") : "- none";
  return `Project: ${target.name}\nLocation: ${place(target)}\nWhat we already know (unverified, confirm it):\n${hints}`;
}

function researchSystem(now: Date): string {
  return [
    `You research one construction project for Tradesmark, which films and documents construction projects for the firms that build them. Today is ${today(now)}.`,
    "Use public sources only. Name firms and institutions, never private individuals. Never record personal email addresses or phone numbers.",
    "Write short factual notes in plain sentences. Cite every fact. Say so when a fact is not found or sources disagree. Do not guess.",
  ].join("\n");
}

const BUILDING_TASK = `Find the building facts and the timeline:
- Use, floors, height, units or floor area, structure, facade system and materials, certifications, reported cost, current status.
- Dated milestones: announcement, approvals, groundbreaking, topping out, completion or opening.
Prefer the owner's and architect's own project pages, local news and trade press.`;

const FIRMS_TASK = `Find the firms on this project and the role of each: owner, developer, architect, general contractor or construction manager, facade or curtain wall contractor, structural and MEP engineers, landscape architect.
For each firm, find its official website (its own domain, not a directory or social profile) and its public contact page if it has one. Give each URL exactly as you found it.
Name each firm exactly as the sources do. Say which of these roles you could not confirm.`;

function extractionSystem(now: Date): string {
  return [
    `You turn research notes on one construction project into a dossier for Tradesmark. Today is ${today(now)}.`,
    "Use only what the notes and the source list support. Every item cites the ids (S1, S2, ...) of the sources that back it, from the [S#] markers in the notes or the source list. Leave out anything no source backs.",
    "Never include personal email addresses, phone numbers or details about private individuals.",
  ].join("\n");
}

function extractionPrompt(target: DossierTarget, notes: string, ledger: SourceLedger): string {
  return `Project: ${target.name}
Location: ${place(target)}

Sources (id | title | publisher | page age | url):
${ledger.toPrompt()}

Notes:
${notes}

Return:
- summary: 2 or 3 sentences on what the project is, who is behind it and where it stands.
- keyFacts: up to 6 short facts for a header row, e.g. Floors "27", Height "92 m (302 ft)", Completed "2013", Units "364", Architect "MGA Partners".
- building: up to 10 facts: use, structure, height, facade, units or area, certification, cost, status.
- firms: each firm a source names on this project. role is one of ${firmRoles.join(", ")}. Use facade for curtain wall, glazing, cladding and building envelope firms, including envelope consultants. scope: what it did here, or null. website: the firm's own site, and contactUrl: its public contact page, copied exactly from the notes or the source list; null when neither shows one. headquarters when a source states it, else null.
- timeline: dated milestones in date order, "when" worded as the sources word it.`;
}

/** Runs both research calls; one may fail and the run goes on with the other. */
async function researchBoth(target: DossierTarget, ledger: SourceLedger, { signal, progress }: RunContext, now: Date) {
  const system = researchSystem(now);
  const userLocation = {
    ...(target.city ? { city: target.city } : {}),
    ...(target.state ? { region: STATE_NAMES[target.state] ?? target.state } : {}),
    country: "US",
    ...(target.state && STATE_NAMES[target.state] ? { timezone: "America/New_York" } : {}),
  };
  const common = { system, maxSearches: 4, maxFetches: 2, userLocation, signal, onProgress: progress, ledger };
  const parts = [
    { scope: "building", prompt: `${briefing(target)}\n\n${BUILDING_TASK}` },
    { scope: "firms", prompt: `${briefing(target)}\n\n${FIRMS_TASK}` },
  ] as const;
  const settled = await Promise.allSettled(parts.map((part) => research({ ...common, ...part })));

  const failures = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  // Past the deadline, or nothing came back: the run fails and the route sends the fallback.
  if (failures.length === settled.length || (failures.length && signal.aborted)) throw failures[0].reason;
  settled.forEach((result, i) => {
    if (result.status === "rejected") {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      progress({ kind: "note", scope: parts[i].scope, message: `This part of the research failed: ${reason}` });
    }
  });
  const text = (result: PromiseSettledResult<ResearchResult>) => (result.status === "fulfilled" ? result.value.text : "");
  return { building: text(settled[0]), firms: text(settled[1]) };
}

export async function runDossier(target: DossierTarget, ctx: RunContext): Promise<Dossier> {
  const { signal, progress } = ctx;
  const now = new Date();
  const ledger = new SourceLedger();

  progress({ kind: "note", message: `Researching ${target.name}` });
  const found = await researchBoth(target, ledger, ctx, now);
  const notes = [
    found.building && `## Building and timeline\n${found.building}`,
    found.firms && `## Firms and team\n${found.firms}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  if (!notes || ledger.size === 0) throw new AgentError("The research returned no notes or sources");

  progress({ kind: "note", message: `Writing the dossier from ${ledger.size} sources` });
  const extraction = await structured(dossierExtractionSchema, extractionSystem(now), extractionPrompt(target, notes, ledger), {
    job: "extract",
    maxTokens: 8000,
    signal,
  });

  const dossier = finalizeDossier({ target, extraction, notes, ledger, runAt: new Date() });
  progress({
    kind: "found",
    message: `Dossier ready: ${dossier.firms.length} firms, ${dossier.building.length} building facts, ${dossier.sources.length} sources`,
  });
  return dossier;
}
