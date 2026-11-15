import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  buildMimeMessage,
  buildRawMessage,
  encodeHeaderValue,
  getThreadReplies,
  resetGmailCache,
  sendEmail,
  senderFor,
  senders,
} = await import("./gmail");

type Call = { url: string; init: RequestInit };

/** A fetch stand-in that answers Google's token, profile, send and thread endpoints. */
function mockGoogle(thread: unknown = { messages: [] }) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url === "https://oauth2.googleapis.com/token") return json({ access_token: "test-access", expires_in: 3600 });
    if (url.endsWith("/users/me/profile")) return json({ emailAddress: "Team@Tradesmark.test" });
    if (url.endsWith("/users/me/messages/send")) return json({ id: "msg-1", threadId: "thread-1" });
    if (url.includes("/users/me/threads/")) return json(thread);
    return json({ error: { message: "unexpected" } }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

beforeEach(() => {
  resetGmailCache();
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  vi.stubEnv("GMAIL_REFRESH_TOKEN", "test-refresh");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendEmail allowlist guard", () => {
  const email = { subject: "Morgan Hall North", body: "Hello from Tradesmark." };

  it("refuses every send when OUTREACH_ALLOWLIST is unset", async () => {
    const { fetchMock } = mockGoogle();
    vi.stubEnv("OUTREACH_ALLOWLIST", "");
    await expect(sendEmail({ to: "team@tradesmark.test", ...email })).rejects.toThrow(/OUTREACH_ALLOWLIST is empty/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an address that is not on the list, and lists of addresses", async () => {
    const { fetchMock } = mockGoogle();
    vi.stubEnv("OUTREACH_ALLOWLIST", "team@tradesmark.test, demo@tradesmark.test");
    await expect(sendEmail({ to: "someone@example.com", ...email })).rejects.toThrow(/not on OUTREACH_ALLOWLIST/);
    await expect(sendEmail({ to: "team@tradesmark.test, x@example.com", ...email })).rejects.toThrow(/one plain/);
    await expect(sendEmail({ to: "Team <team@tradesmark.test>", ...email })).rejects.toThrow(/one plain/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts an allowlisted address case-insensitively and sends it", async () => {
    const { calls } = mockGoogle();
    vi.stubEnv("OUTREACH_ALLOWLIST", " Team@Tradesmark.TEST ,demo@tradesmark.test");
    const result = await sendEmail({ to: "  TEAM@tradesmark.test ", ...email });
    expect(result).toEqual({ id: "msg-1", threadId: "thread-1" });

    const send = calls.find((c) => c.url.endsWith("/messages/send"));
    expect(send?.init.method).toBe("POST");
    expect(new Headers(send?.init.headers).get("authorization")).toBe("Bearer test-access");
    const { raw } = JSON.parse(String(send?.init.body)) as { raw: string };
    const mime = Buffer.from(raw, "base64url").toString("utf8");
    expect(mime).toContain("\r\nTo: team@tradesmark.test\r\n");
    expect(mime).toContain('From: "Tradesmark" <team@tradesmark.test>');
  });

  it("refreshes the access token once and reuses it", async () => {
    const { calls } = mockGoogle();
    vi.stubEnv("OUTREACH_ALLOWLIST", "team@tradesmark.test");
    await sendEmail({ to: "team@tradesmark.test", ...email });
    await sendEmail({ to: "team@tradesmark.test", ...email });
    expect(calls.filter((c) => c.url.includes("oauth2.googleapis.com")).length).toBe(1);
    expect(calls.filter((c) => c.url.endsWith("/profile")).length).toBe(1);
  });

  it("maps an expired refresh token to a clear message without leaking secrets", async () => {
    vi.stubEnv("OUTREACH_ALLOWLIST", "team@tradesmark.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })),
    );
    const error = await sendEmail({ to: "team@tradesmark.test", ...email }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/invalid_grant.*tools\/gmail-token/);
    expect((error as Error).message).not.toMatch(/test-refresh|test-secret/);
  });
});

describe("sending from a person's own Gmail", () => {
  const email = { subject: "Morgan Hall North", body: "Hello from Tradesmark." };
  const abrar = { email: "abislam64@gmail.com", refreshToken: "abrar-token" };
  const rafiat = { email: "rafiatamir@gmail.com", refreshToken: "rafiat-token" };

  /** Each refresh token opens one mailbox: "x-token" gives the access token "access-x-token", owned by `owners[...]`. */
  function mockMailboxes(owners: Record<string, string>) {
    const calls: Call[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
        const url = String(input);
        calls.push({ url, init });
        const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
        const bearer = new Headers(init.headers).get("authorization") ?? "";
        if (url === "https://oauth2.googleapis.com/token") {
          return json({ access_token: `access-${new URLSearchParams(String(init.body)).get("refresh_token")}`, expires_in: 3600 });
        }
        if (url.endsWith("/profile")) return json({ emailAddress: owners[bearer] });
        if (url.endsWith("/messages/send")) return json({ id: "msg-1", threadId: "thread-1" });
        return json({});
      }),
    );
    return calls;
  }
  const mimeOf = (call: Call) =>
    Buffer.from((JSON.parse(String(call.init.body)) as { raw: string }).raw, "base64url").toString("utf8");
  const sendsIn = (calls: Call[]) => calls.filter((c) => c.url.endsWith("/messages/send"));

  it("sends to any address with no allowlist, from that person's own account with no display name", async () => {
    const calls = mockMailboxes({ "Bearer access-abrar-token": "abislam64@gmail.com" });
    vi.stubEnv("OUTREACH_ALLOWLIST", "");
    await sendEmail({ to: "Anyone@Example.com", ...email, sender: abrar });
    const [send] = sendsIn(calls);
    expect(new Headers(send.init.headers).get("authorization")).toBe("Bearer access-abrar-token");
    expect(mimeOf(send)).toMatch(/^From: abislam64@gmail\.com\r\nTo: anyone@example\.com\r\n/);
  });

  it("still refuses anything that is not one plain address", async () => {
    const calls = mockMailboxes({});
    await expect(sendEmail({ to: "a@b.co, c@d.co", ...email, sender: abrar })).rejects.toThrow(/one plain/);
    await expect(sendEmail({ to: "Sam <sam@gmail.com>", ...email, sender: abrar })).rejects.toThrow(/one plain/);
    expect(calls).toHaveLength(0);
  });

  it("keeps one access token and one address per account, so two people never share a mailbox", async () => {
    const calls = mockMailboxes({
      "Bearer access-abrar-token": "abislam64@gmail.com",
      "Bearer access-rafiat-token": "rafiatamir@gmail.com",
    });
    await sendEmail({ to: "x@example.com", ...email, sender: abrar });
    await sendEmail({ to: "y@example.com", ...email, sender: rafiat });
    await sendEmail({ to: "z@example.com", ...email, sender: abrar });
    expect(calls.filter((c) => c.url.includes("oauth2.googleapis.com")).length).toBe(2);
    expect(sendsIn(calls).map((c) => mimeOf(c).split("\r\n")[0])).toEqual([
      "From: abislam64@gmail.com",
      "From: rafiatamir@gmail.com",
      "From: abislam64@gmail.com",
    ]);
  });

  it("refuses when the token set for someone belongs to another account, before sending anything", async () => {
    const calls = mockMailboxes({ "Bearer access-abrar-token": "someone-else@gmail.com" });
    const error = await sendEmail({ to: "x@example.com", ...email, sender: abrar }).catch((e: Error) => e);
    expect((error as Error).message).toMatch(/belongs to someone-else@gmail\.com.*signed in as abislam64@gmail\.com/);
    expect((error as Error).message).not.toContain("abrar-token");
    expect(sendsIn(calls)).toHaveLength(0);
  });

  it("does not loosen the shared account: without a sender the allowlist still applies", async () => {
    const calls = mockMailboxes({});
    vi.stubEnv("OUTREACH_ALLOWLIST", "team@tradesmark.test");
    await expect(sendEmail({ to: "anyone@example.com", ...email })).rejects.toThrow(/not on OUTREACH_ALLOWLIST/);
    expect(calls).toHaveLength(0);
  });
});

describe("senders and senderFor (OUTREACH_SENDERS)", () => {
  it("reads a JSON map of Gmail address to refresh token, normalizing addresses", () => {
    vi.stubEnv("OUTREACH_SENDERS", JSON.stringify({ " Abislam64@Gmail.com ": " abrar-token ", "rafiatamir@gmail.com": "rafiat-token" }));
    expect([...senders()]).toEqual([
      ["abislam64@gmail.com", "abrar-token"],
      ["rafiatamir@gmail.com", "rafiat-token"],
    ]);
    expect(senderFor("ABISLAM64@gmail.com")).toEqual({ email: "abislam64@gmail.com", refreshToken: "abrar-token" });
    expect(senderFor("stranger@gmail.com")).toBeNull();
    expect(senderFor(null)).toBeNull();
    expect(senderFor("")).toBeNull();
  });

  it("drops entries that aren't an address with a token, and treats anything else as no senders", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("OUTREACH_SENDERS", JSON.stringify({ "not-an-address": "t", "a@b.co": "", "c@d.co": 5, "e@f.co": "ok" }));
    expect([...senders()]).toEqual([["e@f.co", "ok"]]);
    for (const bad of ["", "abislam64@gmail.com=abrar-token", "[1,2]", "null", '"text"']) {
      vi.stubEnv("OUTREACH_SENDERS", bad);
      expect(senders().size).toBe(0);
    }
    expect(JSON.stringify(quiet.mock.calls)).not.toContain("abrar-token");
    quiet.mockRestore();
  });
});

describe("RFC 2822 builder", () => {
  const input = {
    from: "team@tradesmark.test",
    to: "inbox@tradesmark.test",
    subject: "Morgan Hall North: a film plan",
    body: "Hi Sam,\nLine two.\n\nhttp://localhost:3000/proposals/client-a?ref=email",
  };

  it("writes the headers with CRLF line ends and a base64 body wrapped at 76", () => {
    const mime = buildMimeMessage({ ...input, body: "x".repeat(300) });
    const [head, body] = mime.split("\r\n\r\n");
    expect(head.split("\r\n")).toEqual([
      "From: team@tradesmark.test",
      "To: inbox@tradesmark.test",
      "Subject: Morgan Hall North: a film plan",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
    ]);
    const lines = body.trimEnd().split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(76);
    expect(Buffer.from(lines.join(""), "base64").toString("utf8")).toBe("x".repeat(300));
  });

  it("encodes the whole message as base64url and round-trips the body with CRLF", () => {
    const raw = buildRawMessage(input);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const mime = Buffer.from(raw, "base64url").toString("utf8");
    expect(mime).toBe(buildMimeMessage(input));
    const body = mime.split("\r\n\r\n")[1].replace(/\r\n/g, "");
    expect(Buffer.from(body, "base64").toString("utf8")).toBe(input.body.replace(/\n/g, "\r\n"));
  });

  it("encodes a non-ASCII subject as RFC 2047 words that decode back", () => {
    const subject = "[Demo → Mock Glazing Co.] Morgan Hall North: a film plan for the curtain wall and lounges";
    const mime = buildMimeMessage({ ...input, subject });
    const header = mime.split("\r\n\r\n")[0];
    const start = header.indexOf("Subject: ") + "Subject: ".length;
    const end = header.indexOf("\r\nMIME-Version");
    const value = header.slice(start, end);
    expect(value).not.toContain("→");
    const words = value.split("\r\n ");
    expect(words.length).toBeGreaterThan(1);
    for (const word of words) {
      expect(word).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
      expect(word.length).toBeLessThanOrEqual(75);
    }
    const decoded = words.map((w) => Buffer.from(w.slice(10, -2), "base64").toString("utf8")).join("");
    expect(decoded).toBe(subject);
  });

  it("keeps a subject with line breaks on one header line", () => {
    expect(encodeHeaderValue("Hello\r\nBcc: evil@example.com")).toBe("Hello Bcc: evil@example.com");
    const mime = buildMimeMessage({ ...input, subject: "Hi\nBcc: evil@example.com" });
    expect(mime).not.toMatch(/\r\nBcc:/);
  });
});

describe("getThreadReplies", () => {
  it("returns only the messages not from us, oldest first, with internalDate as receivedAt", async () => {
    const header = (from: string) => ({ headers: [{ name: "From", value: from }, { name: "Date", value: "x" }] });
    const { calls } = mockGoogle({
      id: "thread-1",
      messages: [
        { id: "m1", internalDate: "1763100000000", snippet: "Our email", payload: header('"Tradesmark" <TEAM@tradesmark.test>') },
        { id: "m3", internalDate: "1763200000000", snippet: "Second reply", payload: header("other@example.com") },
        {
          id: "m2",
          internalDate: "1763150000000",
          snippet: "Thursday works &amp; I&#39;d like the lounges",
          payload: header("Sam Lee <sam@example.com>"),
        },
        { id: "m4", internalDate: "1763250000000", snippet: "Our follow-up", payload: header("team@tradesmark.test") },
      ],
    });

    const replies = await getThreadReplies("thread-1", "team@tradesmark.test");
    expect(replies).toEqual([
      {
        gmailMessageId: "m2",
        from: "Sam Lee <sam@example.com>",
        receivedAt: new Date(1763150000000).toISOString(),
        snippet: "Thursday works & I'd like the lounges",
      },
      {
        gmailMessageId: "m3",
        from: "other@example.com",
        receivedAt: new Date(1763200000000).toISOString(),
        snippet: "Second reply",
      },
    ]);
    const threadCall = calls.find((c) => c.url.includes("/threads/"));
    expect(threadCall?.url).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/threads/thread-1?format=metadata&metadataHeaders=From&metadataHeaders=Date",
    );
  });

  it("rejects a malformed thread id before calling Gmail", async () => {
    const { fetchMock } = mockGoogle();
    await expect(getThreadReplies("../profile", "team@tradesmark.test")).rejects.toThrow(/Bad Gmail thread id/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
