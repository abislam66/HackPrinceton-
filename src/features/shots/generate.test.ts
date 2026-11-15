import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShotIntent } from "./intent";

vi.mock("server-only", () => ({}));
// No project.json neighbors: a generated building has none.
vi.mock("node:fs/promises", () => ({ readFile: vi.fn(async () => { throw new Error("no file"); }) }));
const callStructured = vi.fn();
vi.mock("@/features/proposal/llm", () => ({ callStructured: (...args: unknown[]) => callStructured(...args) }));

const { generateShots, normalizeShotCount, shotCountFor } = await import("./generate");

// Abrar's synthetic generated building: 30 x 70 x 40 m, all four sides, no neighbors.
const model = {
  boundingBox: { min: [-15, 0, -20], max: [15, 70, 20] },
  knownSides: ["north", "east", "south", "west"],
} as Parameters<typeof generateShots>[0]["model"];
const project = {} as Parameters<typeof generateShots>[0]["project"];
const client = { id: "gen-client", company: "Co", role: "trade", need: "sales-and-bids", needsNotes: "", focusElements: [] } as unknown as Parameters<typeof generateShots>[0]["client"];

const moves = ["rise", "orbit", "push-in", "track", "reveal", "ground-hero"] as const;
const sides = ["north", "east", "south", "west"] as const;
function intents(n: number): ShotIntent[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `Shot ${i + 1}`,
    description: "d",
    platform: moves[i % 6] === "ground-hero" ? "ground" : "drone",
    lens: "35mm",
    timeOfDay: "t",
    constructionPhase: "p",
    side: sides[i % 4],
    move: moves[i % 6],
    distance: 1.6,
    height: 0.8,
    durationSec: 6,
  }));
}

beforeEach(() => {
  callStructured.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("shot count", () => {
  it("returns 6 shots for a generated building asked for 4 to 6", async () => {
    callStructured.mockImplementation(async (schema: { parse: (v: unknown) => unknown }) => schema.parse({ shots: intents(6) }));
    const shots = await generateShots({ project, client, model, shotCount: { min: 4, max: 6 } });
    expect(shots).toHaveLength(6);
    expect(shots.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `gen-client-shot-${n}`));
    expect(callStructured.mock.calls[0][1]).toContain("4 to 6 shots");
  });

  it("the reply schema rejects more than the max and fewer than the min", async () => {
    callStructured.mockImplementation(async (schema: { safeParse: (v: unknown) => { success: boolean } }) => {
      expect(schema.safeParse({ shots: intents(7) }).success).toBe(false);
      expect(schema.safeParse({ shots: intents(3) }).success).toBe(false);
      return { shots: intents(4) };
    });
    expect(await generateShots({ project, client, model, shotCount: { min: 4, max: 6 } })).toHaveLength(4);
  });

  it("keeps the default at 3 to 5", async () => {
    callStructured.mockImplementation(async (schema: { safeParse: (v: unknown) => { success: boolean } }) => {
      expect(schema.safeParse({ shots: intents(6) }).success).toBe(false);
      return { shots: intents(5) };
    });
    expect(await generateShots({ project, client, model })).toHaveLength(5);
    expect(callStructured.mock.calls[0][1]).toContain("3 to 5 shots");
  });

  it("clamps requested counts to 3..6", () => {
    expect(normalizeShotCount()).toEqual({ min: 3, max: 5 });
    expect(normalizeShotCount({ min: 1, max: 10 })).toEqual({ min: 3, max: 6 });
    expect(normalizeShotCount({ min: 6, max: 4 })).toEqual({ min: 6, max: 6 });
  });
});

describe("shotCountFor", () => {
  it("asks for 4 to 6 only for a generated model, so the demo keeps 3 to 5", () => {
    expect(shotCountFor({ generated: true })).toEqual({ min: 4, max: 6 });
    expect(shotCountFor({ generated: false })).toBeUndefined();
    expect(shotCountFor({})).toBeUndefined();
    expect(normalizeShotCount(shotCountFor({}))).toEqual({ min: 3, max: 5 });
  });
});
