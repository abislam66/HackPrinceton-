import type { Client } from "@/features/project/schema";
import type { ProjectStage } from "@/features/scout/schema";
import type { FirmRole } from "@/lib/agent/schema";

/*
 * UI copy for the pre-loaded stakeholder data. The data stores enums; screens show these labels.
 * The UI says "stakeholder"; the code says "client".
 */

export const ROLE_LABEL: Record<Client["role"], string> = {
  "general-contractor": "General contractor",
  architect: "Architect",
  "owner-developer": "Owner",
  trade: "Trade contractor",
};

/** What the stakeholder wants out of footage, phrased as their goal. */
export const NEED_LABEL: Record<Client["need"], string> = {
  documentation: "Document the work",
  "self-promotion": "Show off their work",
  recruiting: "Recruit people",
  "sales-and-bids": "Win more bids",
  "investor-and-owner-updates": "Update owners and investors",
  "community-and-pr": "Community and PR",
};

/** A firm's role on a researched project (scouting and the dossier). */
export const FIRM_ROLE_LABEL: Record<FirmRole, string> = {
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

/** Where a scouted project is. */
export const STAGE_LABEL: Record<ProjectStage, string> = {
  "under-construction": "Under construction",
  "topped-out": "Topped out",
  completed: "Completed",
};

/** Up to two initials from a company name, for avatars. Ignores a trailing "(placeholder)". */
export function initials(company: string): string {
  const words = company
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w));
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
