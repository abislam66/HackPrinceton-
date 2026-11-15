/*
 * Real facts about Morgan Hall North, laid out for the internal screens. Every value here comes from
 * data/demo-project/project.json or the public sources listed below. Do not add facts that are not
 * in those. Only the dossier *layout* is a sample; the facts are not.
 *
 * The one source for these facts. Each shows once per page (docs/internal-app-redesign-audit.md, "Surfaces:
 * Sheets"): the project header's stat strip holds the four measurements on every tab, and names and descriptions
 * live in the dossier. So the measurements are kept as numbers, once, and no description repeats them.
 */

export type Fact = { label: string; value: string };

/** The building's measurements. Prose that needs one (WHY_IT_FITS) reads it from here. */
export const MEASUREMENTS = {
  floors: 27,
  height: { m: 92, ft: 302 },
  completed: 2013,
  apartments: 364,
} as const;

/** The project header's stat strip: the four measurements, nothing else. */
export const KEY_FACTS: Fact[] = [
  { label: "Floors", value: String(MEASUREMENTS.floors) },
  { label: "Height", value: `${MEASUREMENTS.height.m} m (${MEASUREMENTS.height.ft} ft)` },
  { label: "Completed", value: String(MEASUREMENTS.completed) },
  { label: "Apartments", value: String(MEASUREMENTS.apartments) },
];

/** A description, without the measurements above. `short` is its one-line form for the Stakeholders tab. */
export type Description = Fact & { short?: string };

/** The dossier's "Building" section. */
export const BUILDING_FACTS: Description[] = [
  { label: "Use", value: "Student residence for upperclassmen" },
  { label: "Structure", value: "All-concrete tower" },
  {
    label: "Facade",
    value: "Curtain wall banded in white tile, charcoal brick service core",
    short: "Curtain wall with white tile bands",
  },
  { label: "Windows", value: "Operable vertical windows running the full height" },
  { label: "Complex", value: "Morgan Hall, with the 10-story Morgan Hall South and a dining pavilion; 1,275 students" },
  { label: "Terrace", value: "30,000 sq ft elevated terrace with a wide stair down to Broad Street" },
  { label: "Certification", value: "LEED Silver" },
  { label: "Status", value: "Complete and occupied" },
];

export const NOT_CONFIRMED = "Not confirmed";

/** The dossier's "People and firms" section. */
export const PEOPLE_AND_FIRMS: Fact[] = [
  { label: "Owner", value: "Temple University" },
  { label: "Architect", value: "MGA Partners" },
  { label: "Landscape architect", value: "OLIN" },
  { label: "General contractor", value: NOT_CONFIRMED },
  { label: "Curtain wall maker", value: NOT_CONFIRMED },
];

/** The Dossier tab's list: names first, then descriptions. */
export const DOSSIER_FACTS: Fact[] = [...PEOPLE_AND_FIRMS, ...BUILDING_FACTS.map(({ label, value }) => ({ label, value }))];

const pick = <T extends Fact>(facts: T[], labels: string[]) => facts.filter((f) => labels.includes(f.label));

/**
 * The Dossier panel on the Stakeholders tab: the names and descriptions the stakeholder rows don't show, in their
 * short form. The owner is a stakeholder row there, so it stays out.
 */
export const DOSSIER_PEEK: Fact[] = [
  ...pick(PEOPLE_AND_FIRMS, ["Architect", "Landscape architect"]),
  ...pick(BUILDING_FACTS, ["Use", "Facade"]).map(({ label, value, short }) => ({ label, value: short ?? value })),
];

export const TIMELINE: { when: string; what: string }[] = [
  { when: "Spring 2011", what: "Groundbreaking" },
  { when: "July 2012", what: "Topped out" },
  { when: "Fall 2013", what: "Opened; students moved in" },
];

export type Source = { publisher: string; title: string; year?: string; url: string };

export const SOURCES: Source[] = [
  {
    publisher: "Temple Now",
    title: "Morgan Hall heralds new era in residential living at Temple",
    year: "2014",
    url: "https://now.temple.edu/news/2014-04-04/morgan-hall-heralds-new-era-residential-living-temple",
  },
  {
    publisher: "Temple Now",
    title: "New Temple residential building reaches top height",
    year: "2012",
    url: "https://now.temple.edu/news/2012-07-25/new-temple-residential-building-reaches-top-height",
  },
  {
    publisher: "Metropolis",
    title: "Temple University Morgan Hall: a new model for student housing",
    year: "2014",
    url: "https://metropolismag.com/projects/temple-university-morgan-hall-new-model-student-housing/",
  },
  {
    publisher: "MGA Partners",
    title: "Morgan Hall, Temple University",
    url: "https://www.mgapartners.com/morgan-hall-temple-univ.html",
  },
  {
    publisher: "OLIN",
    title: "Temple University Mitchell and Hilarie Morgan Hall",
    url: "https://theolinstudio.com/temple-university-mitchell-and-hilarie-morgan-hall/",
  },
  {
    publisher: "Temple Student Affairs",
    title: "Morgan Hall",
    url: "https://studentaffairs.temple.edu/housing/residence-halls/morgan-hall",
  },
  {
    publisher: "CTBUH Skyscraper Center",
    title: "Temple University – Morgan Hall North",
    url: "https://www.skyscrapercenter.com/building/temple-university-morgan-hall-north/28955",
  },
  {
    publisher: "OpenStreetMap",
    title: "Way 335244610",
    url: "https://www.openstreetmap.org/way/335244610",
  },
];

/** "1601 N Broad St, Philadelphia, PA (…)" → "1601 N Broad St, Philadelphia". */
export function shortAddress(address: string): string {
  return address.split(",").slice(0, 2).join(",").trim();
}

/** The one-line "why it fits" for Discover and Projects, from the real facts. */
export const WHY_IT_FITS = `${MEASUREMENTS.floors}-story tower with a curtain wall banded in white tile, finished ${MEASUREMENTS.completed}`;
