import { beforeEach, describe, expect, it, vi } from "vitest";

const { send, session } = vi.hoisted(() => ({ send: vi.fn(), session: vi.fn() }));
vi.mock("@/features/outreach/actions", () => ({ sendOutreach: send }));
vi.mock("@/lib/auth/session", () => ({ getSessionEmail: session }));

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
    session.mockReset();
    session.mockResolvedValue("abislam64@gmail.com");
  });

  it("passes the typed address and the signed-in person's email to the send, apart from the edits", async () => {
    await call({ ...edits, to: "sam@gmail.com" });
    expect(send).toHaveBeenCalledWith("client-a", {
      resend: false,
      edits,
      to: "sam@gmail.com",
      signedInAs: "abislam64@gmail.com",
    });
  });

  it("takes who is sending from the session, never from the request body", async () => {
    session.mockResolvedValue(null);
    await call({ ...edits, to: "sam@gmail.com", signedInAs: "rafiatamir@gmail.com", sender: "rafiatamir@gmail.com" });
    expect(send).toHaveBeenCalledWith("client-a", { resend: false, edits, to: "sam@gmail.com", signedInAs: null });
  });

  it("sends the demo copy when no address is given, and doesn't even look at the session", async () => {
    await call(edits);
    expect(send).toHaveBeenCalledWith("client-a", { resend: false, edits, to: undefined, signedInAs: null });
    await call();
    expect(send).toHaveBeenLastCalledWith("client-a", { resend: false, edits: undefined, to: undefined, signedInAs: null });
    expect(session).not.toHaveBeenCalled();
  });

  it("answers 400 for something that isn't an address, 401 when nobody is signed in, 403 when that account can't send", async () => {
    const cases = [
      ["bad-address", 400],
      ["sign-in", 401],
      ["not-a-sender", 403],
    ] as const;
    for (const [why, status] of cases) {
      send.mockResolvedValueOnce({ status: "refused", why, reason: `reason for ${why}` });
      const res = await call({ ...edits, to: "x@y.co" });
      expect(res.status).toBe(status);
      expect((await res.json()).error).toBe(`reason for ${why}`);
    }
  });

  it("rejects a bad body before sending anything", async () => {
    expect((await call({ subject: "x" })).status).toBe(400);
    expect((await call({ ...edits, to: 42 })).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
});
