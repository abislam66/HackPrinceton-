import { describe, expect, it } from "vitest";
import { linkProjects, parseReply, projectLinks } from "./reply";
import type { Run } from "./runs";

describe("parseReply", () => {
  it("turns '- ' lines into one list and other lines into paragraphs", () => {
    expect(parseReply("We have two:\n- Morgan Hall North\n- 8 Carlisle\n\nWant more?")).toEqual([
      { type: "paragraph", text: "We have two:" },
      { type: "list", items: ["Morgan Hall North", "8 Carlisle"] },
      { type: "paragraph", text: "Want more?" },
    ]);
  });

  it("keeps a hyphen inside a line as text", () => {
    expect(parseReply("Mid-rise - 12 floors")).toEqual([{ type: "paragraph", text: "Mid-rise - 12 floors" }]);
  });
});

const run = (destinations: Run["destinations"]): Run => ({
  id: "r",
  turnId: 1,
  tool: "t",
  label: "t",
  status: "done",
  startedAt: 0,
  steps: [],
  destinations,
});

describe("project links", () => {
  const links = projectLinks([
    run([
      { kind: "candidate", label: "8 Carlisle", href: "/discover/8-carlisle", subject: "8 Carlisle" },
      { kind: "candidate", label: "x", href: "/discover/lavine", subject: "Lavine Hospital (BIDMC)" },
    ]),
    run([{ kind: "project", label: "8 Carlisle", href: "/projects/8-carlisle", subject: "8 Carlisle" }]),
  ]);

  it("prefers a project page over Discover and adds the short form of a parenthesised name", () => {
    expect(links).toContainEqual({ name: "8 Carlisle", href: "/projects/8-carlisle" });
    expect(links).toContainEqual({ name: "Lavine Hospital", href: "/discover/lavine" });
    expect(links).toContainEqual({ name: "Morgan Hall North", href: "/projects/demo-project" });
  });

  it("links whole names only", () => {
    expect(linkProjects("See 8 Carlisle and Morgan Hall Northern.", links)).toEqual([
      { text: "See " },
      { text: "8 Carlisle", href: "/projects/8-carlisle" },
      { text: " and Morgan Hall Northern." },
    ]);
  });

  it("links app paths the reply writes out, when they are real pages", () => {
    expect(linkProjects("See /projects/demo-project/dossier. Not /api/agent or a/b/c.", [])).toEqual([
      { text: "See " },
      { text: "/projects/demo-project/dossier", href: "/projects/demo-project/dossier" },
      { text: ". Not /api/agent or a/b/c." },
    ]);
  });
});
