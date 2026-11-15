import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { structured } = vi.hoisted(() => ({ structured: vi.fn() }));
vi.mock("@/lib/agent/structured", () => ({ structured }));
// The proposal store reaches for Supabase; the drafter only needs the pitch, so stub it.
vi.mock("@/features/proposal/store", () => ({ getProposal: vi.fn(async () => null) }));

const { checkDraft, draftEmail, ensureUrl, proposalUrlFor, templateDraft } = await import("./draft");
const { loadClient, loadProject } = await import("@/features/project/load");
const { emailDraftSchema } = await import("./schema");

const URL_A = "http://localhost:3000/proposals/client-a?ref=email";

beforeEach(() => {
  structured.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("PUBLIC_BASE_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

describe("proposal link", () => {
  it("defaults to localhost and honors PUBLIC_BASE_URL", () => {
    expect(proposalUrlFor("client-a")).toBe(URL_A);
    vi.stubEnv("PUBLIC_BASE_URL", "https://demo.example.com/");
    expect(proposalUrlFor("client-b")).toBe("https://demo.example.com/proposals/client-b?ref=email");
  });

  it("appends the link when the body lacks it, and leaves it alone otherwise", () => {
    expect(ensureUrl("Hi Sam,\n\nThanks.", URL_A)).toBe(`Hi Sam,\n\nThanks.\n\nThe proposal: ${URL_A}`);
    expect(ensureUrl(`See ${URL_A} today.`, URL_A)).toBe(`See ${URL_A} today.`);
  });
});

describe("template fallback", () => {
  it("builds a rule-abiding email for each demo client that includes the proposal URL", async () => {
    const project = await loadProject();
    for (const id of ["client-a", "client-b"]) {
      const client = await loadClient(id);
      if (!client) throw new Error(`missing demo client ${id}`);
      const proposalUrl = proposalUrlFor(id);
      const draft = templateDraft({ client, project, pitch: null, proposalUrl });
      expect(emailDraftSchema.safeParse(draft).success).toBe(true);
      expect(draft.body).toContain(proposalUrl);
      expect(draft.body).toContain(project.name);
      expect(draft.body).toContain(client.company);
      expect(draft.body).toContain(client.contact.name);
      expect(checkDraft(draft, proposalUrl)).toEqual([]);
      expect(words(draft.body)).toBeGreaterThanOrEqual(90);
      expect(words(draft.body)).toBeLessThanOrEqual(170);
    }
  });

  it("is used when the model is unavailable, and still carries the URL", async () => {
    structured.mockRejectedValue(new Error("ANTHROPIC_API_KEY is not set"));
    const result = await draftEmail("client-a");
    expect(result?.source).toBe("template");
    expect(result?.proposalUrl).toBe(URL_A);
    expect(result?.draft.body).toContain(URL_A);
  });

  it("is used when the model's copy keeps breaking the rules", async () => {
    structured.mockResolvedValue({ subject: "Morgan Hall North", body: `Our price is $5,000 for the film. ${URL_A}` });
    const result = await draftEmail("client-a");
    expect(structured).toHaveBeenCalledTimes(2);
    expect(result?.source).toBe("template");
    expect(result?.draft.body).not.toContain("$");
  });
});

describe("draftEmail", () => {
  it("keeps a live draft and appends the URL when the model left it out", async () => {
    const body =
      "Hi Placeholder Contact,\n\nTradesmark films and documents construction projects. We put together a page on Morgan Hall North for your next bid.\n\nThe Tradesmark team";
    structured.mockResolvedValue({ subject: "Morgan Hall North: proof of craft", body });
    const result = await draftEmail("client-a");
    expect(result?.source).toBe("live");
    expect(result?.draft.subject).toBe("Morgan Hall North: proof of craft");
    expect(result?.draft.body.startsWith(body)).toBe(true);
    expect(result?.draft.body).toContain(URL_A);
    const [, , user] = structured.mock.calls[0] as [unknown, string, string];
    expect(user).toContain(URL_A);
    expect(user).toContain("Mock Glazing Co.");
  });

  it("returns null for an unknown client", async () => {
    expect(await draftEmail("no-such-client")).toBeNull();
    expect(await draftEmail("../etc")).toBeNull();
    expect(structured).not.toHaveBeenCalled();
  });
});
