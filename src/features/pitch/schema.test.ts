import { describe, expect, it } from "vitest";
import { pitchSchema } from "@/features/pitch/schema";

const pitch = {
  teaserLine: "The curtain wall, from the air.",
  headline: "Show the glazing going up",
  problem: "Bids are won on work nobody saw being built.",
  solution: "We film the install as it happens.",
  shotCaptions: [{ shotId: "shot-1", caption: "Here we focus on the curtain wall." }],
  acrossProject: "We are filming across the whole project.",
};

describe("pitchSchema", () => {
  it("accepts a pitch with shot captions and the across-project line", () => {
    expect(pitchSchema.parse(pitch)).toEqual(pitch);
  });

  it("rejects a pitch without shotCaptions", () => {
    expect(pitchSchema.safeParse({ ...pitch, shotCaptions: undefined }).success).toBe(false);
  });

  it("rejects a pitch without acrossProject", () => {
    expect(pitchSchema.safeParse({ ...pitch, acrossProject: undefined }).success).toBe(false);
  });

  it("rejects a caption that has no shotId", () => {
    const bad = { ...pitch, shotCaptions: [{ caption: "No shot named." }] };
    expect(pitchSchema.safeParse(bad).success).toBe(false);
  });
});
