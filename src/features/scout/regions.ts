import type { RegionId, ScoutCandidate } from "./schema";

/*
 * The five Northeast regions scouting covers. Each run searches every region in parallel,
 * steered toward the local trade press and biased to the region's location.
 */

export type RegionState = ScoutCandidate["state"];

export type Region = {
  id: RegionId;
  /** For the feed and the Discover filters, e.g. "Found 4 projects in New Jersey". */
  label: string;
  state: RegionState;
  /** The places a project must be in to count for this region. */
  cities: string[];
  /** Regional trade press to steer searches toward. */
  press: { name: string; domain: string }[];
  /** Biases web search results toward the region. */
  userLocation: { city: string; region: string; country: string; timezone: string };
};

export const stateNames: Record<RegionState, string> = {
  NY: "New York",
  PA: "Pennsylvania",
  CT: "Connecticut",
  MA: "Massachusetts",
  NJ: "New Jersey",
};

export const regions: Record<RegionId, Region> = {
  "new-york": {
    id: "new-york",
    label: "New York City",
    state: "NY",
    cities: [
      "Manhattan",
      "Brooklyn",
      "Queens",
      "Long Island City",
      "the Bronx",
      "Staten Island",
      "Yonkers",
      "White Plains",
      "New Rochelle",
    ],
    press: [
      { name: "New York YIMBY", domain: "newyorkyimby.com" },
      { name: "Commercial Observer", domain: "commercialobserver.com" },
      { name: "The Real Deal", domain: "therealdeal.com" },
      { name: "ENR New York", domain: "enr.com" },
    ],
    userLocation: { city: "New York", region: "New York", country: "US", timezone: "America/New_York" },
  },
  "philadelphia-main-line": {
    id: "philadelphia-main-line",
    label: "Philadelphia and the Main Line",
    state: "PA",
    cities: [
      "Philadelphia",
      "Lower Merion",
      "Bala Cynwyd",
      "Narberth",
      "Ardmore",
      "Haverford",
      "Bryn Mawr",
      "Radnor",
      "Wayne",
      "Conshohocken",
      "King of Prussia",
    ],
    press: [
      { name: "Philadelphia YIMBY", domain: "phillyyimby.com" },
      { name: "Philadelphia Business Journal", domain: "bizjournals.com/philadelphia" },
      { name: "The Philadelphia Inquirer", domain: "inquirer.com" },
      { name: "ENR MidAtlantic", domain: "enr.com" },
    ],
    userLocation: { city: "Philadelphia", region: "Pennsylvania", country: "US", timezone: "America/New_York" },
  },
  connecticut: {
    id: "connecticut",
    label: "Connecticut",
    state: "CT",
    cities: ["Stamford", "Greenwich", "Norwalk", "Bridgeport", "New Haven", "Hartford", "Danbury"],
    press: [
      { name: "CT Insider", domain: "ctinsider.com" },
      { name: "Hartford Business Journal", domain: "hartfordbusiness.com" },
      { name: "ENR New England", domain: "enr.com" },
    ],
    userLocation: { city: "Hartford", region: "Connecticut", country: "US", timezone: "America/New_York" },
  },
  boston: {
    id: "boston",
    label: "Greater Boston",
    state: "MA",
    cities: ["Boston", "Cambridge", "Somerville", "Brookline", "Watertown", "Everett", "Quincy", "Newton", "Waltham"],
    press: [
      { name: "BLDUP", domain: "bldup.com" },
      { name: "Boston Real Estate Times", domain: "bostonrealestatetimes.com" },
      { name: "Bisnow Boston", domain: "bisnow.com" },
      { name: "Boston Business Journal", domain: "bizjournals.com/boston" },
    ],
    userLocation: { city: "Boston", region: "Massachusetts", country: "US", timezone: "America/New_York" },
  },
  "new-jersey": {
    id: "new-jersey",
    label: "New Jersey",
    state: "NJ",
    cities: ["Jersey City", "Hoboken", "Newark", "Harrison", "Fort Lee", "New Brunswick", "Princeton", "Camden"],
    press: [
      { name: "NJBIZ", domain: "njbiz.com" },
      { name: "Jersey Digs", domain: "jerseydigs.com" },
      { name: "ROI-NJ", domain: "roi-nj.com" },
      { name: "Bisnow New Jersey", domain: "bisnow.com" },
    ],
    userLocation: { city: "Jersey City", region: "New Jersey", country: "US", timezone: "America/New_York" },
  },
};
