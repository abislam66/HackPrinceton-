/*
 * Sample projects for Discover and the Projects list. Every name is invented and every location is
 * neighbourhood-level only: none of these is a real building or company. Shown without a "Sample" label;
 * their actions stay disabled, because only Morgan Hall North is loaded.
 */

export type SampleProject = {
  id: string;
  name: string;
  location: string;
  whyItFits: string;
  stakeholders: number;
};

export const SAMPLE_PROJECTS: SampleProject[] = [
  {
    id: "kestrel-yard-lofts",
    name: "Kestrel Yard Lofts",
    location: "Fishtown, Philadelphia",
    whyItFits: "8-story loft building with a glass rooftop addition, finished this spring",
    stakeholders: 3,
  },
  {
    id: "marrowby-house",
    name: "Marrowby House",
    location: "University City, Philadelphia",
    whyItFits: "14-story graduate residence with a terracotta rainscreen, opened in August",
    stakeholders: 4,
  },
  {
    id: "alder-row-townhomes",
    name: "Alder Row Townhomes",
    location: "Point Breeze, Philadelphia",
    whyItFits: "42 brick townhomes around a shared courtyard, last phase finished in September",
    stakeholders: 2,
  },
];

export const SAMPLE_TOOLTIP = "Sample data: only Morgan Hall North is loaded";
