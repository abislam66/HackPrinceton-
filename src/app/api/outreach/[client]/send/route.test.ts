import { beforeEach, describe, expect, it, vi } from "vitest";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/features/outreach/actions", () => ({ sendOutreach: send }));

const { POST } = await import("./route");

const call = (body?: unknown, query = "") =>
  POST(
    new Request(`https://app.example/api/outreach/client-a/send${query}`, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ client: "client-a" }) } as never,
  );
const edits = { subject: "Morgan Hall North, on film", body: "Hi Sam,\n\nA short note with our proposal for you." };

describe("POST /api/outreach/[client]/send", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({ status: "ok", message: { status: "sent" } });
  });

  it("passes the typed address to the send, apart from the edits", async () => {
    await call({ ...edits, to: "sam@gmail.com" });
    expect(send).toHaveBeenCalledWith("client-a", { resend: false, edits, to: "sam@gmail.com" });
  });

  it("sends to the demo inbox when no address is given", async () => {
    await call(edits);
    expect(send).toHaveBeenCalledWith("client-a", { resend: false, edits, to: undefined });
    await call();
    expect(send).toHaveBeenLastCalledWith("client-a", { resend: false, edits: undefined, to: undefined });
  });

  it("answers 403 for an address that is not allowed, and 400 for one that is not an address", async () => {
    send.mockResolvedValueOnce({ status: "refused", why: "not-allowed", reason: "x@y.co isn't on OUTREACH_ALLOWLIST" });
    const forbidden = await call({ ...edits, to: "x@y.co" });
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).error).toContain("OUTREACH_ALLOWLIST");

    send.mockResolvedValueOnce({ status: "refused", why: "bad-address", reason: "Enter one email address." });
    expect((await call({ ...edits, to: "nope" })).status).toBe(400);
  });

  it("rejects a bad body before sending anything", async () => {
    expect((await call({ subject: "x" })).status).toBe(400);
    expect((await call({ ...edits, to: 42 })).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
});
