import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { modelFor, supportsServerFallback } = await import("./models");

describe("models", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses Sonnet for research and drafting, Haiku for extraction", () => {
    vi.stubEnv("RESEARCH_MODEL", "");
    vi.stubEnv("EXTRACT_MODEL", "");
    vi.stubEnv("DRAFT_MODEL", "");
    expect(modelFor("research")).toBe("claude-sonnet-5-5");
    expect(modelFor("extract")).toBe("claude-haiku-5-5");
    expect(modelFor("draft")).toBe("claude-sonnet-5-5");
  });

  it("lets .env.local override a job's model", () => {
    vi.stubEnv("RESEARCH_MODEL", " claude-opus-5-5 ");
    expect(modelFor("research")).toBe("claude-opus-5-5");
  });

  it("sends the server-side fallback only to models that accept it", () => {
    expect(supportsServerFallback("claude-sonnet-5-5")).toBe(true);
    expect(supportsServerFallback("claude-opus-5-5")).toBe(true);
    expect(supportsServerFallback("claude-haiku-5-5")).toBe(false);
  });
});
