import { describe, expect, it } from "vitest";
import { proposalStatuses } from "./schema";
import { canTransition, statusUpdateSchema } from "./status";

describe("proposal status transitions", () => {
  const allowed = new Set(["draft>approved", "approved>sent", "approved>draft"]);

  for (const from of proposalStatuses) {
    for (const to of proposalStatuses) {
      const key = `${from}>${to}`;
      it(`${from} -> ${to} is ${allowed.has(key) ? "allowed" : "rejected"}`, () => {
        expect(canTransition(from, to)).toBe(allowed.has(key));
      });
    }
  }

  it("validates the request body", () => {
    expect(statusUpdateSchema.safeParse({ status: "approved" }).success).toBe(true);
    expect(statusUpdateSchema.safeParse({ status: "published" }).success).toBe(false);
    expect(statusUpdateSchema.safeParse({}).success).toBe(false);
  });
});
