import "server-only";
import { loadProject } from "@/features/project/load";
import { PROJECT_SLUG, type Project } from "@/features/project/schema";
import { scoutResultSchema, type ScoutCandidate } from "@/features/scout/schema";
import type { FirmRole } from "@/lib/agent/schema";
import { readRecord, readSnapshot } from "@/lib/store/json-store";
import type { DossierTarget } from "./schema";

/*
 * What a dossier run researches: the pre-loaded demo project (Morgan Hall North) or a project the
 * scout found. Hints are facts we already hold, passed to the research to steer its searches.
 */

const PROJECT_ID = /^[a-z0-9-]+$/;
const SCOUT_SNAPSHOT = "src/features/scout/snapshot/latest.json";
const MAX_HINT = 200;

const ROLE_LABELS: Record<FirmRole, string> = {
  owner: "Owner",
  developer: "Developer",
  architect: "Architect",
  "general-contractor": "General contractor",
  "construction-manager": "Construction manager",
  facade: "Facade",
  "structural-engineer": "Structural engineer",
  "mep-engineer": "MEP engineer",
  "landscape-architect": "Landscape architect",
  other: "Other firm",
};

const STAGE_LABELS: Record<ScoutCandidate["stage"], string> = {
  "under-construction": "under construction",
  "topped-out": "topped out",
  completed: "completed",
};

/** First sentence, at most MAX_HINT characters, cut at a word. */
function shortHint(text: string): string {
  const sentence = text.split(/(?<=\.)\s+/)[0].trim();
  if (sentence.length <= MAX_HINT) return sentence;
  const cut = sentence.slice(0, MAX_HINT - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[,;:]$/, "")}…`;
}

function demoTarget(project: Project): DossierTarget {
  return {
    projectId: PROJECT_SLUG,
    name: project.name,
    // "1601 N Broad St, Philadelphia, PA (Broad Street and ...)" → "1601 N Broad St".
    address: project.address.split(",")[0].trim() || null,
    city: "Philadelphia",
    state: "PA",
    hints: [project.summary, project.buildingType, project.timeline].map(shortHint).filter(Boolean),
  };
}

function usd(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1).replace(/\.0$/, "")} billion`;
  if (value >= 1e6) return `$${Math.round(value / 1e6)} million`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function candidateTarget(candidate: ScoutCandidate): DossierTarget {
  const hints = [
    candidate.buildingType,
    `Stage: ${STAGE_LABELS[candidate.stage]}${candidate.completion ? `, completion ${candidate.completion}` : ""}`,
    candidate.floors ? `${candidate.floors} floors` : null,
    candidate.valueUsd ? `Reported cost: ${usd(candidate.valueUsd)}` : null,
    ...candidate.firms.map((firm) => `${ROLE_LABELS[firm.role]}: ${firm.name}`),
  ];
  return {
    projectId: candidate.id,
    name: candidate.name,
    address: candidate.address,
    city: candidate.city,
    state: candidate.state,
    hints: hints.filter((hint): hint is string => Boolean(hint?.trim())).map(shortHint),
  };
}

/** The candidate from the latest stored scout run, else from the committed scout snapshot. */
async function findCandidate(id: string): Promise<ScoutCandidate | null> {
  const stored = await readRecord("scout", "latest", scoutResultSchema);
  const fromStore = stored?.candidates.find((c) => c.id === id);
  if (fromStore) return fromStore;
  const snapshot = await readSnapshot(SCOUT_SNAPSHOT, scoutResultSchema);
  return snapshot?.candidates.find((c) => c.id === id) ?? null;
}

/** The dossier target for a project id, or null when no such project is known. */
export async function resolveTarget(projectId: string): Promise<DossierTarget | null> {
  if (!PROJECT_ID.test(projectId)) return null;
  if (projectId === PROJECT_SLUG) return demoTarget(await loadProject());
  const candidate = await findCandidate(projectId);
  return candidate ? candidateTarget(candidate) : null;
}
