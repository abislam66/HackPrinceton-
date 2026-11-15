import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proposalUrlFor, publicBaseUrl, repairProposalLink } from "./link";
import type { OutreachMessage } from "./schema";

beforeEach(() => {
  for (const key of ["PUBLIC_BASE_URL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) vi.stubEnv(key, "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("publicBaseUrl", () => {
  it("is localhost only with nothing set", () => {
    expect(publicBaseUrl()).toBe("http://localhost:3000");
  });

  it("uses the production domain on a production deploy, not the deployment URL", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_URL", "tradesmarktool-abc123.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "tradesmarktool.vercel.app");
    expect(proposalUrlFor("client-a")).toBe("https://tradesmarktool.vercel.app/proposals/client-a?ref=email");
  });

  it("uses a preview deploy's own URL", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "tradesmarktool-git-x.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "tradesmarktool.vercel.app");
    expect(publicBaseUrl()).toBe("https://tradesmarktool-git-x.vercel.app");
  });

  it("lets PUBLIC_BASE_URL win, trailing slash trimmed", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "tradesmarktool.vercel.app");
    vi.stubEnv("PUBLIC_BASE_URL", "https://tradesmark.example/");
    expect(publicBaseUrl()).toBe("https://tradesmark.example");
  });
});

describe("repairProposalLink", () => {
  const OLD = "http://localhost:3000/proposals/client-a?ref=email";
  const message: OutreachMessage = {
    id: "demo--client-a",
    projectSlug: "demo",
    clientId: "client-a",
    intendedFor: { name: "Sam", title: null, company: "Co", email: null },
    deliveredTo: null,
    subject: "Hi",
    body: `Hello,\n\nThe proposal: ${OLD}\n\nAgain: ${OLD}`,
    proposalUrl: OLD,
    status: "draft",
    gmailMessageId: null,
    gmailThreadId: null,
    createdAt: "2026-11-15T00:00:00.000Z",
    sentAt: null,
    error: null,
    replies: [],
  };

  it("moves a localhost draft onto the live host, in the body too", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "tradesmarktool.vercel.app");
    const fixed = repairProposalLink(message);
    const live = "https://tradesmarktool.vercel.app/proposals/client-a?ref=email";
    expect(fixed.proposalUrl).toBe(live);
    expect(fixed.body).not.toContain("localhost");
    expect(fixed.body.split(live)).toHaveLength(3);
  });

  it("leaves sent messages and local dev alone", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "tradesmarktool.vercel.app");
    const sent = { ...message, status: "sent" as const };
    expect(repairProposalLink(sent)).toBe(sent);
    vi.unstubAllEnvs();
    vi.stubEnv("PUBLIC_BASE_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(repairProposalLink(message)).toBe(message);
  });
});
