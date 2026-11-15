import { describe, expect, it } from "vitest";
import { keepCited, normalizeUrl, publisherOf, remapIds, SourceLedger } from "./ledger";

describe("normalizeUrl", () => {
  it("drops www, trailing slashes, fragments and tracking params", () => {
    expect(normalizeUrl("https://www.Example.com/a/b/?utm_source=x&id=3#top")).toBe("https://example.com/a/b?id=3");
  });

  it("leaves a malformed URL as trimmed text", () => {
    expect(normalizeUrl("  not a url ")).toBe("not a url");
  });
});

describe("SourceLedger", () => {
  it("numbers pages in order and de-duplicates the same page", () => {
    const ledger = new SourceLedger();
    expect(ledger.add("https://now.temple.edu/news/a", "Morgan Hall opens")).toBe("S1");
    expect(ledger.add("https://ny.yimby.com/b", "Tower tops out", "2 weeks ago")).toBe("S2");
    expect(ledger.add("https://www.now.temple.edu/news/a/#x", "Other title")).toBe("S1");
    expect(ledger.size).toBe(2);
    expect(ledger.list()[1]).toMatchObject({ publisher: "ny.yimby.com", pageAge: "2 weeks ago" });
  });

  it("refuses non-http URLs and falls back to the host for a missing title", () => {
    const ledger = new SourceLedger();
    expect(ledger.add("javascript:alert(1)", "x")).toBeNull();
    ledger.add("https://bldup.com/projects/1", null);
    expect(ledger.list()[0].title).toBe("bldup.com");
  });

  it("subsets to cited pages and renumbers them in citation order", () => {
    const ledger = new SourceLedger();
    ledger.add("https://a.com/1", "A");
    ledger.add("https://b.com/2", "B");
    ledger.add("https://c.com/3", "C");
    const { sources, remap } = ledger.subset(["S3", "S1", "S3", "S9"]);
    expect(sources.map((s) => [s.id, s.title])).toEqual([
      ["S1", "C"],
      ["S2", "A"],
    ]);
    expect(remapIds({ sourceIds: ["S1", "S2", "S3"] }, remap).sourceIds).toEqual(["S2", "S1"]);
  });

  it("keepCited drops items citing nothing the ledger knows", () => {
    const ledger = SourceLedger.from([
      { id: "S1", url: "https://a.com/1", title: "A", publisher: "a.com", pageAge: null },
    ]);
    const kept = keepCited(
      [
        { name: "real", sourceIds: ["S1", "S7"] },
        { name: "invented", sourceIds: ["S7"] },
        { name: "uncited", sourceIds: [] },
      ],
      ledger,
    );
    expect(kept).toEqual([{ name: "real", sourceIds: ["S1"] }]);
  });

  it("toPrompt lists one source per line", () => {
    const ledger = new SourceLedger();
    ledger.add("https://a.com/1", "A", "2025");
    expect(ledger.toPrompt()).toBe("S1 | A | a.com | 2025 | https://a.com/1");
  });
});

describe("publisherOf", () => {
  it("returns the bare host", () => {
    expect(publisherOf("https://www.metropolismag.com/projects/x")).toBe("metropolismag.com");
    expect(publisherOf("nope")).toBe("unknown");
  });
});
