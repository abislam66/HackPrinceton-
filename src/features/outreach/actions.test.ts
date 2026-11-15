import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// In-memory stand-in for the JSON store, so tests never write .data/.
const { records } = vi.hoisted(() => ({ records: new Map<string, unknown>() }));
vi.mock("@/lib/store/json-store", () => ({
  readRecord: async (collection: string, key: string, schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }) => {
    const value = records.get(`${collection}/${key}`);
    if (value === undefined) return null;
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : null;
  },
  writeRecord: async (collection: string, key: string, value: unknown) => {
    records.set(`${collection}/${key}`, structuredClone(value));
    return "memory";
  },
  listRecords: async (collection: string) =>
    [...records.entries()].filter(([k]) => k.startsWith(`${collection}/`)).map(([, v]) => v),
}));
vi.mock("@/lib/agent/structured", () => ({
  structured: vi.fn(async () => {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }),
}));
vi.mock("@/features/proposal/store", () => ({ getProposal: vi.fn(async () => null) }));

const { draftOutreach, editOutreachDraft, sendOutreach, getOutreachOverview } = await import("./actions");
const { resetGmailCache } = await import("./gmail");
const { getSentAt } = await import("@/features/workspace/state");

let sends: string[] = [];
let failSend = false;

function mockGmail() {
  sends = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input);
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
      if (url.includes("oauth2.googleapis.com")) return json({ access_token: "test-access", expires_in: 3600 });
      if (url.endsWith("/profile")) return json({ emailAddress: "sender@tradesmark.test" });
      if (url.endsWith("/messages/send")) {
        if (failSend) return json({ error: { message: "Backend Error" } }, 500);
        sends.push(Buffer.from((JSON.parse(String(init.body)) as { raw: string }).raw, "base64url").toString("utf8"));
        return json({ id: `msg-${sends.length}`, threadId: `thread-${sends.length}` });
      }
      if (url.includes("/threads/")) return json({ messages: [] });
      return json({}, 404);
    }),
  );
}

beforeEach(() => {
  records.clear();
  resetGmailCache();
  failSend = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("PUBLIC_BASE_URL", "");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  vi.stubEnv("GMAIL_REFRESH_TOKEN", "test-refresh");
  vi.stubEnv("OUTREACH_DELIVER_TO", "Inbox@Tradesmark.test");
  vi.stubEnv("OUTREACH_ALLOWLIST", "inbox@tradesmark.test");
  mockGmail();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("outreach actions", () => {
  it("drafts, sends to OUTREACH_DELIVER_TO only, and refuses a second send", async () => {
    expect(await sendOutreach("client-a")).toEqual({ status: "no-draft" });

    const drafted = await draftOutreach("client-a");
    if (drafted.status !== "ok") throw new Error(drafted.status);
    expect(drafted.source).toBe("template");
    expect(drafted.message).toMatchObject({ id: "demo-project--client-a", status: "draft", deliveredTo: null });
    expect(drafted.message.intendedFor).toMatchObject({ company: "Mock Glazing Co. (placeholder)", email: null });

    const sent = await sendOutreach("client-a");
    if (sent.status !== "ok") throw new Error(sent.status);
    expect(sent.message).toMatchObject({
      status: "sent",
      deliveredTo: "inbox@tradesmark.test",
      gmailMessageId: "msg-1",
      gmailThreadId: "thread-1",
      error: null,
    });
    expect(getSentAt("client-a")).toBe(sent.message.sentAt);

    expect(sends).toHaveLength(1);
    const [head, rawBody] = sends[0].split("\r\n\r\n");
    expect(head).toContain("\r\nTo: inbox@tradesmark.test\r\n");
    expect(head).toMatch(/Subject: =\?UTF-8\?B\?/);
    const body = Buffer.from(rawBody.replace(/\r\n/g, ""), "base64").toString("utf8");
    expect(body.split("\r\n")[0]).toBe(
      "[Demo send, intended for Placeholder Contact, Director of Business Development, Mock Glazing Co. (placeholder). Delivered to the team inbox instead.]",
    );
    expect(body).toContain("http://localhost:3000/proposals/client-a?ref=email");

    expect((await sendOutreach("client-a")).status).toBe("already-sent");
    expect((await draftOutreach("client-a")).status).toBe("already-sent");
    expect((await sendOutreach("client-a", { resend: true })).status).toBe("ok");
    expect(sends).toHaveLength(2);
    expect((await draftOutreach("client-a", { force: true })).status).toBe("ok");
  });

  it("sends the operator's edits and keeps the proposal link in the body", async () => {
    await draftOutreach("client-a");
    const sent = await sendOutreach("client-a", {
      edits: { subject: "  Morgan Hall North, on film  ", body: "Hi Sam,\n\nA short note with our proposal for you." },
    });
    if (sent.status !== "ok") throw new Error(sent.status);
    expect(sent.message.subject).toBe("Morgan Hall North, on film");
    expect(sent.message.body).toBe(
      "Hi Sam,\n\nA short note with our proposal for you.\n\nThe proposal: http://localhost:3000/proposals/client-a?ref=email",
    );
    const body = Buffer.from(sends[0].split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString("utf8");
    expect(body).toContain("A short note with our proposal for you.");
    expect(body).toContain("http://localhost:3000/proposals/client-a?ref=email");
  });

  it("edits a draft in place, keeps the proposal link, and flags pricing", async () => {
    expect((await editOutreachDraft("client-a", { subject: "Hi" })).status).toBe("no-draft");
    const drafted = await draftOutreach("client-a");
    if (drafted.status !== "ok") throw new Error("expected a draft");
    const edited = await editOutreachDraft("client-a", { body: "Short note. Our pricing is fair." });
    if (edited.status !== "ok") throw new Error("expected an edit");
    expect(edited.message.subject).toBe(drafted.message.subject);
    expect(edited.message.body).toContain(drafted.message.proposalUrl);
    expect(edited.problems).toContain("mentions pricing");
  });

  it("sends once when two sends race", async () => {
    await draftOutreach("client-b");
    const results = await Promise.all([sendOutreach("client-b"), sendOutreach("client-b")]);
    expect(results.map((r) => r.status).sort()).toEqual(["already-sent", "ok"]);
    expect(sends).toHaveLength(1);
  });

  it("reports missing configuration without touching the draft", async () => {
    await draftOutreach("client-a");
    vi.stubEnv("OUTREACH_DELIVER_TO", "");
    expect(await sendOutreach("client-a")).toMatchObject({ status: "not-configured" });
    vi.stubEnv("OUTREACH_DELIVER_TO", "someone-else@example.com");
    expect(await sendOutreach("client-a")).toMatchObject({ status: "not-configured" });
    vi.stubEnv("GMAIL_REFRESH_TOKEN", "");
    expect(await sendOutreach("client-a")).toMatchObject({ status: "not-configured" });
    expect(sends).toHaveLength(0);
    const overview = await getOutreachOverview();
    expect(overview.messages[0].status).toBe("draft");
  });

  it("marks the message failed when Gmail errors", async () => {
    await draftOutreach("client-a");
    failSend = true;
    const result = await sendOutreach("client-a");
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.message.status).toBe("failed");
    expect(result.message.error).toMatch(/Gmail is unavailable/);
  });

  it("returns unknown-client for a client with no file", async () => {
    expect(await draftOutreach("no-such-client")).toEqual({ status: "unknown-client" });
  });

  it("builds the overview with the account and delivery address", async () => {
    const overview = await getOutreachOverview();
    expect(overview.gmail).toEqual({
      configured: true,
      account: "sender@tradesmark.test",
      deliverTo: "inbox@tradesmark.test",
    });
    expect(overview.messages).toEqual([]);
  });
});
