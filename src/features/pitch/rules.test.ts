import { describe, expect, it } from "vitest";
import type { Client, Project } from "@/features/project/schema";
import type { Shot } from "@/features/shots/schema";
import { checkPitch } from "./rules";
import type { Pitch } from "./schema";

const project = { name: "Hobson College" } as Project;
const client = { focusElements: ["the glass drum facing Elm Drive"] } as Client;
const shots = [{ id: "client-a-shot-1" }, { id: "client-a-shot-2" }] as Shot[];
const ctx = { project, client, shots };

const good: Pitch = {
  teaserLine: "You're glazing Hobson College. We're here to document it.",
  headline: "Hobson College's glass drum, filmed for your next bid",
  problem: "Your next campus bid is won on proof of finished work.",
  solution: "We film the glass drum facing Elm Drive at dusk, when the glazing reads clearly.",
  shotCaptions: [
    { shotId: "client-a-shot-1", caption: "Here we push in on the drum." },
    { shotId: "client-a-shot-2", caption: "Here we track the ground-floor windows." },
  ],
  acrossProject: "We're filming across Hobson College with every team on site.",
};

describe("checkPitch", () => {
  it("passes clean copy", () => {
    expect(checkPitch(good, ctx)).toEqual([]);
  });

  it.each([
    ["$", { problem: "Footage from $2,000." }, /money/],
    ["price", { solution: "Our pricing is simple." }, /pricing/],
    ["quote", { headline: "Get a quote for Hobson College" }, /pricing/],
    ["scope of work", { problem: "The scope of work covers the drum." }, /scope of work/],
    ["exclamation", { teaserLine: "You're building Hobson College!" }, /exclamation/],
    ["buzzword", { solution: "Cutting-edge footage of the drum." }, /buzzword/],
  ])("rejects %s", (_label, patch, reason) => {
    expect(checkPitch({ ...good, ...patch }, ctx).join("\n")).toMatch(reason);
  });

  it("requires the project name", () => {
    const pitch = { ...good, teaserLine: "x", headline: "x", acrossProject: "We film across the site." };
    expect(checkPitch(pitch, ctx).join("\n")).toMatch(/never names the project/);
  });

  it("requires a focus element", () => {
    const pitch = { ...good, headline: "Hobson College", solution: "We film it well.", shotCaptions: good.shotCaptions.map((c) => ({ ...c, caption: "A shot." })) };
    expect(checkPitch(pitch, ctx).join("\n")).toMatch(/focus elements/);
  });

  it("requires exactly one caption per shot", () => {
    const pitch = { ...good, shotCaptions: good.shotCaptions.slice(0, 1) };
    expect(checkPitch(pitch, ctx).join("\n")).toMatch(/one caption per shot/);
  });
});
