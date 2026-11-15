import { BUILDING_FACTS, DOSSIER_SUMMARY, KEY_FACTS, PEOPLE_AND_FIRMS, type Fact } from "@/features/demo/building";

/*
 * Where each fact about the building shows on the project overview, so each shows once per page
 * (docs/internal-app-redesign-audit.md, "Surfaces: Sheets"). The header's stat strip, on every tab, holds the four
 * measurements; names and descriptions live in the dossier. The owner stays out of the header: it is a stakeholder
 * row on the Stakeholders tab and the first name in the dossier.
 */

/** The header's stat strip. KEY_FACTS also carries Architect and Landscape, which are names, not measurements. */
const MEASUREMENTS = new Set(["Floors", "Height", "Completed", "Apartments"]);
export const HEADER_STATS: Fact[] = KEY_FACTS.filter((f) => MEASUREMENTS.has(f.label));

/**
 * building.ts folds measurements into two descriptions ("…, 364 apartments", "…, 27 stories, 92 m (302 ft)"). The stat
 * strip above already says them, so these say the rest.
 */
const WITHOUT_MEASUREMENTS: Record<string, string> = {
  Use: "Student residence for upperclassmen",
  Structure: "All-concrete tower",
};

function unmeasured(fact: Fact): Fact {
  return { ...fact, value: WITHOUT_MEASUREMENTS[fact.label] ?? fact.value };
}

const pick = (facts: Fact[], labels: string[]) => facts.filter((f) => labels.includes(f.label));

/** The Dossier tab's definition list: names first, then descriptions. */
export const DOSSIER_FACTS: Fact[] = [...PEOPLE_AND_FIRMS, ...BUILDING_FACTS.map(unmeasured)];

/** The Dossier panel on the Stakeholders tab: the names and descriptions the stakeholder rows don't already show. */
export const DOSSIER_PEEK: Fact[] = [
  ...pick(PEOPLE_AND_FIRMS, ["Architect", "Landscape architect"]),
  ...pick(DOSSIER_SUMMARY, ["Use", "Facade"]).map(unmeasured),
];
