import { describe, expect, it } from "vitest";
import { cutAt, MAX_REEL_SECONDS, planReel } from "./reel";
import type { Shot } from "./schema";

function shot(id: string, seconds: number): Shot {
  return {
    id,
    name: id,
    description: "",
    platform: "drone",
    lens: "35mm",
    timeOfDay: "",
    constructionPhase: "",
    side: "north",
    camera: {
      fov: 54,
      keyframes: [
        { t: 0, position: [0, 10, 100], target: [0, 10, 0] },
        { t: seconds / 2, position: [0, 20, 90], target: [0, 10, 0] },
        { t: seconds, position: [0, 30, 80], target: [0, 10, 0] },
      ],
    },
  };
}

describe("planReel", () => {
  it("plays short lists in full, back to back", () => {
    const reel = planReel([shot("a", 6), shot("b", 8), shot("c", 7)]);
    expect(reel.duration).toBe(21);
    expect(reel.cuts.map((c) => [c.start, c.duration])).toEqual([[0, 6], [6, 8], [14, 7]]);
  });

  it("never runs past 30 seconds, speeding every shot up evenly", () => {
    const reel = planReel([shot("a", 9), shot("b", 10), shot("c", 8), shot("d", 6), shot("e", 9)]);
    expect(reel.cuts).toHaveLength(5);
    expect(reel.duration).toBeLessThanOrEqual(MAX_REEL_SECONDS);
    expect(reel.duration).toBeGreaterThan(29.9);
    // Same move, just faster: keyframe times keep their proportions.
    const b = reel.cuts[1].path.keyframes.map((k) => k.t);
    expect(b[1] / b[2]).toBeCloseTo(0.5);
  });

  it("drops later shots instead of making cuts shorter than 3 seconds", () => {
    const reel = planReel(Array.from({ length: 12 }, (_, i) => shot(`s${i}`, 10)));
    expect(reel.duration).toBeLessThanOrEqual(MAX_REEL_SECONDS);
    for (const cut of reel.cuts) expect(cut.duration).toBeGreaterThanOrEqual(3);
    expect(reel.cuts[0].shot.id).toBe("s0");
  });

  it("handles no shots", () => {
    expect(planReel([])).toEqual({ cuts: [], duration: 0 });
  });

  it("finds the cut playing at a time", () => {
    const reel = planReel([shot("a", 6), shot("b", 8)]);
    expect(cutAt(reel, 0)?.shot.id).toBe("a");
    expect(cutAt(reel, 6.5)?.shot.id).toBe("b");
    expect(cutAt(reel, 99)?.shot.id).toBe("b");
  });
});
