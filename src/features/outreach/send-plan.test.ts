import { describe, expect, it } from "vitest";
import { planSend } from "./send-plan";

const base = {
  gmailConfigured: true,
  alreadyEmailed: false,
  gmailOpened: false,
  address: null as string | null,
  sendFrom: null as string | null,
  deliverTo: "inbox@tradesmark.test" as string | null,
};

describe("planSend", () => {
  it("sends a demo copy to the team inbox when no address is typed", () => {
    expect(planSend(base)).toEqual({ kind: "demo", deliverTo: "inbox@tradesmark.test" });
    // Being a sender changes nothing until an address is typed.
    expect(planSend({ ...base, sendFrom: "abislam64@gmail.com" })).toEqual({ kind: "demo", deliverTo: "inbox@tradesmark.test" });
  });

  it("sends from the person's own Gmail to the typed address when the app can send as them", () => {
    expect(planSend({ ...base, address: "sam@gmail.com", sendFrom: "abislam64@gmail.com" })).toEqual({
      kind: "direct",
      from: "abislam64@gmail.com",
      to: "sam@gmail.com",
    });
  });

  it("blocks a typed address for someone the app can't send as, and points to Open in Gmail", () => {
    const plan = planSend({ ...base, address: "sam@gmail.com", sendFrom: null });
    expect(plan.kind).toBe("blocked");
    if (plan.kind === "blocked") expect(plan.reason).toContain("Open in Gmail");
  });

  it("only records the send when Gmail isn't set up, it already went out, or the person went to Gmail", () => {
    const typed = { ...base, address: "sam@gmail.com", sendFrom: "abislam64@gmail.com" };
    expect(planSend({ ...typed, gmailConfigured: false })).toEqual({ kind: "record" });
    expect(planSend({ ...typed, alreadyEmailed: true })).toEqual({ kind: "record" });
    expect(planSend({ ...typed, gmailOpened: true })).toEqual({ kind: "record" });
  });
});
