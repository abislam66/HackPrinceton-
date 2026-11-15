import { describe, expect, it } from "vitest";
import { SourceLedger } from "@/lib/agent/ledger";
import {
  DossierError,
  finalizeDossier,
  fullAddress,
  hasPersonalContact,
  missingRoles,
  verifiedUrl,
  type DossierExtraction,
  type FinalizeInput,
} from "./finalize";
import { dossierSchema, type DossierTarget } from "./schema";

const target: DossierTarget = {
  projectId: "demo-project",
  name: "Morgan Hall North",
  address: "1601 N Broad St",
  city: "Philadelphia",
  state: "PA",
  hints: [],
};

function makeLedger(): SourceLedger {
  const ledger = new SourceLedger();
  ledger.add("https://now.temple.edu/news/2014-04-04/morgan-hall", "Morgan Hall heralds new era at Temple", "April 4, 2014"); // S1
  ledger.add("https://www.mgapartners.com/morgan-hall-temple-univ.html", "Morgan Hall, Temple University"); // S2
  ledger.add("https://theolinstudio.com/temple-morgan-hall/", "Temple University Mitchell and Hilarie Morgan Hall"); // S3
  ledger.add("https://www.skyscrapercenter.com/building/morgan-hall-north/28955", "Temple University – Morgan Hall North"); // S4
  ledger.add("https://example-news.com/turner", "Turner Construction tops out Broad Street tower"); // S5
  ledger.add("https://directory.example.org/firms", "Firm directory"); // S6, never cited
  return ledger;
}

const NOTES = [
  "## Building and timeline",
  "Morgan Hall North is a 27-story residence hall at Temple University [S1, S4]. It topped out in July 2012 [S1].",
  "## Firms and team",
  "MGA Partners designed the tower [S2]. The terrace was landscaped by OLIN, see https://www.theolinstudio.com/contact [S3].",
  "Caroline Street is nearby.",
].join("\n");

function extraction(overrides: Partial<DossierExtraction> = {}): DossierExtraction {
  return {
    summary: { text: "A 27-story Temple University residence hall by MGA Partners, completed in 2013.", sourceIds: ["S1", "S2"] },
    keyFacts: [
      { label: "Floors", value: "27", sourceIds: ["S4"] },
      { label: "Units", value: "364", sourceIds: ["S99"] },
    ],
    building: [{ label: "Use", value: "Student residence", sourceIds: ["S1", "S42"] }],
    firms: [
      {
        name: "Temple University",
        role: "owner",
        scope: "Owner",
        website: "https://www.temple.edu",
        contactUrl: null,
        headquarters: "Philadelphia, PA",
        sourceIds: ["S1"],
      },
      {
        name: "MGA Partners",
        role: "architect",
        scope: "Design architect",
        website: "https://www.mgapartners.com/",
        contactUrl: null,
        headquarters: null,
        sourceIds: ["S2"],
      },
      {
        name: "OLIN",
        role: "landscape-architect",
        scope: "Terrace",
        website: "https://theolinstudio.com",
        contactUrl: "https://www.theolinstudio.com/contact",
        headquarters: null,
        sourceIds: ["S3"],
      },
    ],
    timeline: [
      { when: "July 2012", what: "Topped out", sourceIds: ["S1"] },
      { when: "Fall 2013", what: "Opened", sourceIds: ["S77"] },
    ],
    ...overrides,
  };
}

function run(overrides: Partial<DossierExtraction> = {}, input: Partial<FinalizeInput> = {}) {
  return finalizeDossier({
    target,
    extraction: extraction(overrides),
    notes: NOTES,
    ledger: makeLedger(),
    runAt: new Date("2026-11-14T15:00:00Z"),
    ...input,
  });
}

describe("finalizeDossier", () => {
  it("returns a dossier that matches the contract", () => {
    const dossier = run();
    expect(dossierSchema.safeParse(dossier).success).toBe(true);
    expect(dossier).toMatchObject({
      projectId: "demo-project",
      projectName: "Morgan Hall North",
      address: "1601 N Broad St, Philadelphia, PA",
      runAt: "2026-11-14T15:00:00.000Z",
    });
  });

  it("keeps only cited items and strips ids the ledger does not have", () => {
    const dossier = run();
    expect(dossier.keyFacts.map((f) => f.label)).toEqual(["Floors"]);
    expect(dossier.building).toEqual([{ label: "Use", value: "Student residence", sourceIds: ["S1"] }]);
    expect(dossier.timeline.map((e) => e.when)).toEqual(["July 2012"]);
  });

  it("refuses a summary with no source the research returned", () => {
    expect(() => run({ summary: { text: "Uncited", sourceIds: ["S99"] } })).toThrow(DossierError);
    expect(() => run({ summary: { text: "Uncited", sourceIds: [] } })).toThrow(DossierError);
    expect(() => run({ summary: { text: "  ", sourceIds: ["S1"] } })).toThrow(DossierError);
  });

  it("drops firms the notes and their cited titles never name", () => {
    const dossier = run({
      firms: [
        ...extraction().firms,
        // In a cited title only: kept, with the corporate suffix ignored.
        { name: "Turner Construction Company", role: "general-contractor", scope: null, website: null, contactUrl: null, headquarters: null, sourceIds: ["S5"] },
        // Named nowhere: invented.
        { name: "Keystone Glass", role: "facade", scope: null, website: null, contactUrl: null, headquarters: null, sourceIds: ["S1"] },
        // "Carol" is only part of the word "Caroline".
        { name: "Carol", role: "other", scope: null, website: null, contactUrl: null, headquarters: null, sourceIds: ["S1"] },
        // Cites only an unknown id.
        { name: "MGA Partners", role: "developer", scope: null, website: null, contactUrl: null, headquarters: null, sourceIds: ["S99"] },
      ],
    });
    expect(dossier.firms.map((f) => f.name)).toEqual([
      "Temple University",
      "MGA Partners",
      "OLIN",
      "Turner Construction Company",
    ]);
  });

  it("does not accept a firm named only in the title of a source it does not cite", () => {
    const dossier = run({
      firms: [
        ...extraction().firms,
        { name: "Turner Construction", role: "general-contractor", scope: null, website: null, contactUrl: null, headquarters: null, sourceIds: ["S1"] },
      ],
    });
    expect(dossier.firms.some((f) => f.name.startsWith("Turner"))).toBe(false);
  });

  it("merges duplicate firms in the same role and keeps distinct roles", () => {
    const dossier = run({
      firms: [
        { name: "MGA Partners", role: "architect", scope: null, website: null, contactUrl: null, headquarters: null, sourceIds: ["S2"] },
        { name: "mga partners, Inc.", role: "architect", scope: "Design architect", website: "https://www.mgapartners.com/", contactUrl: null, headquarters: "Philadelphia, PA", sourceIds: ["S4", "S2"] },
        { name: "Temple University", role: "owner", scope: null, website: null, contactUrl: null, headquarters: null, sourceIds: ["S1"] },
        { name: "Temple University", role: "developer", scope: null, website: null, contactUrl: null, headquarters: null, sourceIds: ["S1"] },
      ],
    });
    const architects = dossier.firms.filter((f) => f.role === "architect");
    expect(architects).toHaveLength(1);
    expect(architects[0]).toMatchObject({
      name: "MGA Partners",
      scope: "Design architect",
      website: "https://www.mgapartners.com/",
      headquarters: "Philadelphia, PA",
    });
    expect(architects[0].sourceIds).toHaveLength(2);
    expect(dossier.firms.filter((f) => f.name === "Temple University").map((f) => f.role)).toEqual(["owner", "developer"]);
  });

  it("keeps only URLs on a site the tools returned or that the notes quote", () => {
    const dossier = run();
    const byName = Object.fromEntries(dossier.firms.map((f) => [f.name, f]));
    // now.temple.edu was returned, so temple.edu is the same site.
    expect(byName["Temple University"].website).toBe("https://www.temple.edu");
    expect(byName["MGA Partners"].website).toBe("https://www.mgapartners.com/");
    expect(byName.OLIN.website).toBe("https://theolinstudio.com");
    expect(byName.OLIN.contactUrl).toBe("https://www.theolinstudio.com/contact");
  });

  it("computes the missing key roles in display order", () => {
    expect(run().missingRoles).toEqual(["general-contractor", "facade"]);
    expect(run({ firms: [] }).missingRoles).toEqual(["owner", "architect", "general-contractor", "facade"]);
  });

  it("keeps only cited sources, renumbered in order of first citation", () => {
    const dossier = run();
    expect(dossier.sources.map((s) => s.url)).toEqual([
      "https://now.temple.edu/news/2014-04-04/morgan-hall", // summary
      "https://www.mgapartners.com/morgan-hall-temple-univ.html", // summary
      "https://www.skyscrapercenter.com/building/morgan-hall-north/28955", // key fact
      "https://theolinstudio.com/temple-morgan-hall/", // OLIN
    ]);
    expect(dossier.sources.map((s) => s.id)).toEqual(["S1", "S2", "S3", "S4"]);
    expect(dossier.summary.sourceIds).toEqual(["S1", "S2"]);
    expect(dossier.keyFacts[0].sourceIds).toEqual(["S3"]);
    expect(dossier.firms.find((f) => f.name === "OLIN")?.sourceIds).toEqual(["S4"]);
    const ids = new Set(dossier.sources.map((s) => s.id));
    const cited = [dossier.summary, ...dossier.keyFacts, ...dossier.building, ...dossier.firms, ...dossier.timeline];
    expect(cited.every((item) => item.sourceIds.length > 0 && item.sourceIds.every((id) => ids.has(id)))).toBe(true);
  });

  it("drops personal emails and phone numbers", () => {
    const dossier = run({
      building: [
        { label: "Use", value: "Student residence", sourceIds: ["S1"] },
        { label: "Contact", value: "jane.doe@temple.edu", sourceIds: ["S1"] },
        { label: "Leasing", value: "Call (215) 555-0134", sourceIds: ["S1"] },
      ],
      firms: [
        { name: "MGA Partners", role: "architect", scope: "Ask for Jim at 215-555-0134", website: null, contactUrl: "mailto:info@mgapartners.com", headquarters: null, sourceIds: ["S2"] },
      ],
    });
    expect(dossier.building.map((f) => f.label)).toEqual(["Use"]);
    expect(dossier.firms[0]).toMatchObject({ scope: null, contactUrl: null });
  });
});

describe("verifiedUrl", () => {
  const ledger = makeLedger();
  it("refuses anything but a well-formed http(s) URL", () => {
    expect(verifiedUrl("mailto:info@mgapartners.com", ledger, NOTES)).toBeNull();
    expect(verifiedUrl("javascript:alert(1)", ledger, NOTES)).toBeNull();
    expect(verifiedUrl("ftp://mgapartners.com/", ledger, NOTES)).toBeNull();
    expect(verifiedUrl("mgapartners.com", ledger, NOTES)).toBeNull();
    expect(verifiedUrl("https://user:pw@mgapartners.com/", ledger, NOTES)).toBeNull();
    expect(verifiedUrl(null, ledger, NOTES)).toBeNull();
  });
  it("matches the site (last two labels), ignoring www, subdomains and case", () => {
    expect(verifiedUrl("https://MGAPartners.com/contact", ledger, "")).toBe("https://MGAPartners.com/contact");
    expect(verifiedUrl("https://mgapartners.com.evil.io/", ledger, "")).toBeNull();
    expect(verifiedUrl("https://temple.edu/", ledger, "")).toBe("https://temple.edu/");
    expect(verifiedUrl("https://made-up-firm.com/", ledger, "")).toBeNull();
  });
  it("accepts a URL the notes quote verbatim", () => {
    expect(verifiedUrl("https://www.theolinstudio.com/contact", new SourceLedger(), NOTES)).toBe(
      "https://www.theolinstudio.com/contact",
    );
  });
});

describe("helpers", () => {
  it("builds the address from the street, city and state", () => {
    expect(fullAddress(target, [])).toBe("1601 N Broad St, Philadelphia, PA");
    expect(fullAddress({ ...target, address: "1601 N Broad St, Philadelphia, PA 19122" }, [])).toBe(
      "1601 N Broad St, Philadelphia, PA 19122",
    );
    expect(fullAddress({ ...target, address: null }, [{ label: "Address", value: "1601 N Broad St", sourceIds: ["S1"] }])).toBe(
      "1601 N Broad St, Philadelphia, PA",
    );
    expect(fullAddress({ ...target, address: null }, [])).toBeNull();
  });

  it("lists missing roles from the firms present; a construction manager counts as the builder", () => {
    expect(missingRoles([{ role: "facade" }, { role: "owner" }, { role: "construction-manager" }])).toEqual([
      "architect",
    ]);
    expect(missingRoles([{ role: "facade" }, { role: "owner" }])).toEqual(["architect", "general-contractor"]);
  });

  it("spots emails and phone numbers but not ordinary figures", () => {
    expect(hasPersonalContact("info@firm.com")).toBe(true);
    expect(hasPersonalContact("+1 215.555.0134")).toBe(true);
    expect(hasPersonalContact("364 apartments, 1,275 students, 92 m (302 ft)")).toBe(false);
    expect(hasPersonalContact("Groundbreaking spring 2011, opened 2013")).toBe(false);
  });
});
