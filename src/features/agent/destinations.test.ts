import { describe, expect, it } from "vitest";
import { appRoute, destinationSchema, destinationsFor } from "./destinations";

const json = (v: unknown) => JSON.stringify(v);

const scout = {
  source: "store",
  count: 9,
  candidates: [
    { id: "8-carlisle", name: "8 Carlisle", city: "New York, NY", score: 91 },
    { id: "lavine", name: "Lavine Cancer Hospital", city: "Boston, MA", score: 88 },
    { id: "the-tower", name: "The Tower", city: "Hartford, CT", score: 80 },
    { id: "fourth", name: "Fourth", city: "Newark, NJ", score: 70 },
  ],
};

const dossier = {
  projectId: "demo-project",
  project: "Morgan Hall North",
  keyFacts: ["Height: 27 stories", "Units: 1,275 beds", "Cost: $360 million", "Opened: 2026"],
  firms: [{ name: "A" }, { name: "B" }],
  sourceCount: 18,
};

describe("appRoute", () => {
  it.each([
    "/projects",
    "/projects/demo-project",
    "/projects/demo-project/dossier",
    "/projects/demo-project/stakeholders/client-a",
    "/discover",
    "/discover/8-carlisle",
    "/outreach?tab=drafts",
    "/proposals/client-a?preview=1",
  ])("accepts the real page %s", (path) => {
    expect(appRoute(path)).toBe(path);
  });

  it("sends a scouted project's /model to its project page, where the model is the first tab", () => {
    expect(appRoute("/projects/8-carlisle/model")).toBe("/projects/8-carlisle");
  });

  it.each(["/projects/x/nope", "https://evil.example/projects", "/api/agent", "", 42, null])("rejects %s", (path) => {
    expect(appRoute(path)).toBeNull();
  });
});

describe("destinationsFor", () => {
  it("links scout results to Discover with a preview of the top three, then each top candidate", () => {
    const dests = destinationsFor("get_scout_results", {}, json(scout));
    expect(dests.map((d) => d.href)).toEqual(["/discover", "/discover/8-carlisle", "/discover/lavine", "/discover/the-tower"]);
    expect(dests[0].preview).toEqual({
      type: "scout",
      total: 9,
      candidates: scout.candidates.slice(0, 3),
    });
    expect(dests[1]).toMatchObject({ kind: "candidate", subject: "8 Carlisle", summary: "New York, NY · fit 91" });
  });

  it("links the demo dossier to its project tab with firm and source counts and three key facts", () => {
    const [d] = destinationsFor("research_dossier", { projectId: "demo-project" }, json(dossier));
    expect(d).toMatchObject({ kind: "dossier", href: "/projects/demo-project/dossier", summary: "2 firms · 18 sources" });
    expect(d.preview).toEqual({
      type: "dossier",
      firmCount: 2,
      sourceCount: 18,
      keyFacts: [
        { label: "Height", value: "27 stories" },
        { label: "Units", value: "1,275 beds" },
        { label: "Cost", value: "$360 million" },
      ],
    });
  });

  it("links a scouted dossier to the project once it was added, else to Discover", () => {
    const result = json({ ...dossier, projectId: "8-carlisle", project: "8 Carlisle" });
    expect(destinationsFor("get_dossier", { projectId: "8-carlisle" }, result)[0].href).toBe("/discover/8-carlisle");
    const added = destinationsFor("get_dossier", { projectId: "8-carlisle" }, result, { addedProjects: new Set(["8-carlisle"]) });
    expect(added[0].href).toBe("/projects/8-carlisle/dossier");
  });

  it("links a draft to Outreach with who it's to and the subject, and to the stakeholder", () => {
    const result = json({ clientId: "client-b", for: "Ana Ruiz, Temple University", status: "draft", subject: "Filming Morgan Hall" });
    const dests = destinationsFor("draft_outreach", { clientId: "client-b" }, result);
    expect(dests.map((d) => d.href)).toEqual(["/outreach?tab=drafts", "/projects/demo-project/stakeholders/client-b"]);
    expect(dests[0].preview).toEqual({ type: "draft", to: "Ana Ruiz, Temple University", subject: "Filming Morgan Hall" });
  });

  it("reads a model's status and time, on the project page", () => {
    const result = json({ projectId: "8-carlisle", status: "ready", generatedAt: "2026-11-15T07:10:15Z", page: "/projects/8-carlisle/model" });
    const [d] = destinationsFor("get_project_model", { projectId: "8-carlisle" }, result);
    expect(d).toMatchObject({ kind: "model", href: "/projects/8-carlisle" });
    expect(d.preview).toEqual({ type: "model", status: "ready", generatedAt: "2026-11-15T07:10:15Z" });
  });

  it("has nothing to open for a model that isn't there", () => {
    expect(destinationsFor("get_project_model", { projectId: "x" }, json({ projectId: "x", status: "none" }))).toEqual([]);
  });

  it("no longer links a progress page (the Progress tab is gone)", () => {
    expect(destinationsFor("get_progress", {}, json({ sample: true }))).toEqual([]);
  });

  it("takes app tools' page paths from a list, named by each item", () => {
    const result = json([
      { id: "demo-project", name: "Morgan Hall North", kind: "demo", page: "/projects/demo-project" },
      { id: "8-carlisle", name: "8 Carlisle", kind: "scouted", page: "/projects/8-carlisle" },
      { id: "bad", name: "Bad", page: "/nowhere" },
    ]);
    const dests = destinationsFor("list_projects", {}, result);
    expect(dests.map((d) => [d.kind, d.label, d.href])).toEqual([
      ["project", "Morgan Hall North", "/projects/demo-project"],
      ["project", "8 Carlisle", "/projects/8-carlisle"],
    ]);
  });

  it("adds a proposal page when the tool returns one", () => {
    const result = json({ clientId: "client-a", headline: "Up close", proposalPage: "/proposals/client-a?preview=1" });
    expect(destinationsFor("regenerate_proposal", {}, result)).toEqual([
      { kind: "proposal", label: "client-a proposal", href: "/proposals/client-a?preview=1", subject: "client-a", summary: "Up close" },
    ]);
  });

  it.each([
    ["an error", "Error: a scout run is already in progress."],
    ["plain text", "No scout results yet. Run scout_projects."],
    ["JSON with no pages", json({ clientId: "a", status: "sent" })],
  ])("returns nothing for %s", (_label, text) => {
    expect(destinationsFor("review_proposal", {}, text)).toEqual([]);
  });

  it("only builds destinations the schema accepts", () => {
    const all = [
      ...destinationsFor("get_scout_results", {}, json(scout)),
      ...destinationsFor("get_dossier", {}, json(dossier)),
    ];
    for (const d of all) expect(destinationSchema.safeParse(d).success).toBe(true);
  });
});
