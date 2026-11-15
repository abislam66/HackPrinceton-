import "server-only";
import { loadDossier } from "@/features/dossier/load";
import type { Dossier } from "@/features/dossier/schema";
import type { Client, Project } from "@/features/project/schema";
import type { FirmRole } from "@/lib/agent/schema";
import { FIRM_ROLE_LABEL, STAGE_LABEL } from "@/lib/labels";
import { scoutPlace } from "./facts";
import { getScoutedProject, type ScoutedProject } from "./projects";
import type { ScoutCandidate } from "./schema";

/*
 * A project added from scouting gets its stakeholders from the firms research found on it: the dossier's firms once
 * it has been researched, the firms scouting named until then. They are derived on every read, not stored, so a new
 * dossier run updates them. The project agent's changes are stored on top, like the demo project's (project-agent
 * store).
 *
 * Needs are canned per role, never classified from company data (AGENTS.md). Contacts are the firm's team: research
 * keeps no personal names or emails.
 */

/** At most this many stakeholders, owners and builders first. */
const MAX_STAKEHOLDERS = 6;

type Firm = { name: string; role: FirmRole; scope: string | null };

/** Which roles come first: who commissions and builds it, then who designed and clad it, then everyone else. */
const ROLE_ORDER: FirmRole[] = [
  "owner",
  "developer",
  "general-contractor",
  "construction-manager",
  "architect",
  "facade",
  "structural-engineer",
  "mep-engineer",
  "landscape-architect",
  "other",
];

/** The stakeholder brief a firm in this role gets, given the building's stage. */
function brief(firm: Firm, c: ScoutCandidate): Pick<Client, "role" | "need" | "needsNotes" | "focusElements"> {
  const building = `${c.name}, a ${c.buildingType} in ${c.city}`;
  const finished = c.stage === "completed";
  const did = firm.scope ? ` Its part: ${firm.scope.replace(/\.$/, "")}.` : "";
  switch (firm.role) {
    case "owner":
    case "developer":
      return {
        role: "owner-developer",
        need: finished ? "community-and-pr" : "investor-and-owner-updates",
        needsNotes: finished
          ? `${firm.name} owns ${building}, now complete. It wants footage that shows tenants, buyers and the neighborhood what the building is and how it sits in the city.${did}`
          : `${firm.name} is developing ${building}, ${STAGE_LABEL[c.stage].toLowerCase()}. It needs regular, high-quality progress footage for investors, lenders and future tenants, showing the building rising on schedule.${did}`,
        focusElements: ["the building on the skyline", "the street-level frontage and entrance"],
      };
    case "general-contractor":
    case "construction-manager":
      return {
        role: "general-contractor",
        need: finished ? "sales-and-bids" : "documentation",
        needsNotes: finished
          ? `${firm.name} built ${building}. It wants finished-building footage it can put in bid packages and its portfolio to win the next tower.${did}`
          : `${firm.name} is building ${building}. It needs a dated visual record of the work, for the owner, for claims and for its own portfolio.${did}`,
        focusElements: ["the structure and facade as they go up", "site logistics and crane work"],
      };
    case "architect":
    case "landscape-architect":
      return {
        role: "architect",
        need: "self-promotion",
        needsNotes: `${firm.name} designed ${building}. It wants footage that shows the design as built, for its portfolio, awards submissions and the press.${did}`,
        focusElements: ["the facade and massing", "how the building meets the street"],
      };
    default:
      return {
        role: "trade",
        need: "sales-and-bids",
        needsNotes: `${firm.name} worked on ${building} as ${FIRM_ROLE_LABEL[firm.role].toLowerCase()}. It needs proof of craft on a named, high-profile building to show in its next bids.${did}`,
        focusElements: firm.role === "facade" ? ["the curtain wall and facade details"] : ["the finished building"],
      };
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The stakeholder id: the firm, then the project, so it is unique across projects (the proposal page finds a
 * stakeholder by id alone).
 */
export function stakeholderId(firmName: string, projectId: string): string {
  return `${slugify(firmName) || "firm"}-${projectId}`;
}

/** The research's firms, owners and builders first, one per company. */
function firmsOf(project: ScoutedProject, dossier: Dossier | null): Firm[] {
  const found: Firm[] = dossier
    ? dossier.firms.map((f) => ({ name: f.name, role: f.role, scope: f.scope }))
    : project.candidate.firms.map((f) => ({ name: f.name, role: f.role, scope: null }));
  const seen = new Set<string>();
  return found
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
    .filter((f) => {
      const key = slugify(f.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_STAKEHOLDERS);
}

/** The stakeholders research found for a project added from scouting. Null when it isn't one. */
export async function scoutedStakeholders(projectId: string): Promise<Client[] | null> {
  const project = await getScoutedProject(projectId);
  if (!project) return null;
  const dossier = (await loadDossier(projectId))?.data ?? null;
  return firmsOf(project, dossier).map((firm) => ({
    id: stakeholderId(firm.name, projectId),
    company: firm.name,
    contact: { name: `${firm.name} team`, title: FIRM_ROLE_LABEL[firm.role] },
    ...brief(firm, project.candidate),
  }));
}

/**
 * The facts the pipeline and the project agent read, for a project added from scouting: from the candidate, with the
 * dossier's summary when it has been researched. Null when it isn't one.
 */
export async function scoutedProjectFacts(projectId: string): Promise<(Project & { slug: string }) | null> {
  const project = await getScoutedProject(projectId);
  if (!project) return null;
  const c = project.candidate;
  const dossier = (await loadDossier(projectId))?.data ?? null;
  const known = [
    c.floors ? `${c.floors} floors` : null,
    c.completion ? `completion ${c.completion}` : null,
    ...c.firms.map((f) => `${FIRM_ROLE_LABEL[f.role]}: ${f.name}`),
  ].filter(Boolean);
  return {
    slug: project.id,
    name: c.name,
    address: dossier?.address ?? scoutPlace(c),
    // Scouting doesn't geocode. Nothing in the proposal pipeline reads the location.
    location: { lat: 0, lng: 0 },
    buildingType: c.buildingType,
    scopeType: `${STAGE_LABEL[c.stage]} ${c.buildingType}. ${c.whyItFits}`,
    timeline: [STAGE_LABEL[c.stage], c.completion ? `completion ${c.completion}` : "completion date unknown"].join(", "),
    summary: dossier?.summary.text ?? `${c.name} is a ${c.buildingType} at ${scoutPlace(c)}. ${known.join("; ")}.`,
  };
}
