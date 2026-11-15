import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BOUNDING_BOX } from "@/features/model/schema";
import { poseAt } from "./motion";
import { cutAt, flightProblems, MAX_REEL_SECONDS, planReel } from "./reel";
import type { Shot } from "./schema";

const box = PLACEHOLDER_BOUNDING_BOX;

function shot(id: string, seconds: number, z = 100, fov = 54): Shot {
  return {
    id,
    name: id,
    description: "",
    platform: "drone",
    lens: "35mm",
    timeOfDay: "",
    constructionPhase: "",
    side: z > 0 ? "south" : "north",
    camera: {
      fov,
      keyframes: [
        { t: 0, position: [0, 10, z], target: [0, 10, 0] },
        { t: seconds / 2, position: [10, 20, z * 0.9], target: [0, 15, 0] },
        { t: seconds, position: [20, 30, z * 0.8], target: [0, 20, 0] },
      ],
    },
  };
}

describe("planReel", () => {
  it("joins short lists with a flight between shots", () => {
    const reel = planReel([shot("a", 6), shot("b", 8)], box);
    const [a, b] = reel.cuts;
    expect(a.start).toBe(0);
    expect(a.duration).toBeCloseTo(6, 2);
    expect(b.duration).toBeCloseTo(8, 2);
    // A flight of at least 1 s between them.
    expect(b.start - 6).toBeGreaterThanOrEqual(0.99);
    expect(reel.duration).toBeCloseTo(b.start + 8);
    // Shot keyframes plus the transition's waypoints, times strictly increasing.
    const t = reel.path!.keyframes.map((k) => k.t);
    expect(t.length).toBeGreaterThan(6);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
  });

  it("never runs past 30 seconds, keeps several shots, and passes its own flight check", () => {
    const reel = planReel([shot("a", 9), shot("b", 10), shot("c", 8), shot("d", 6), shot("e", 9)], box);
    expect(reel.cuts.length).toBeGreaterThanOrEqual(2);
    expect(reel.duration).toBeLessThanOrEqual(MAX_REEL_SECONDS);
    expect(flightProblems(reel, box, [])).toEqual([]);
  });

  it("drops later shots instead of making shots shorter than 3 s", () => {
    const reel = planReel(Array.from({ length: 12 }, (_, i) => shot(`s${i}`, 10)), box);
    expect(reel.duration).toBeLessThanOrEqual(MAX_REEL_SECONDS);
    for (const cut of reel.cuts) expect(cut.duration).toBeGreaterThanOrEqual(3);
  });

  it("flies over the roof between shots on opposite sides, and blends the lens", () => {
    const reel = planReel([shot("south", 6, 100, 74), shot("north", 6, -100, 29)], box);
    expect(reel.cuts).toHaveLength(2);
    const [a, b] = reel.cuts;
    const middle = poseAt(reel.path!, (a.start + a.duration + b.start) / 2);
    expect(middle.position[1]).toBeGreaterThan(box.max[1]);
    expect(middle.fov).toBeLessThan(74);
    expect(middle.fov).toBeGreaterThan(29);
  });

  it("handles no shots", () => {
    expect(planReel([], box)).toEqual({ path: null, cuts: [], duration: 0 });
  });

  it("finds the shot playing, or being flown to, at a time", () => {
    const reel = planReel([shot("a", 6), shot("b", 8)], box);
    expect(cutAt(reel, 1)?.shot.id).toBe("a");
    expect(cutAt(reel, 7)?.shot.id).toBe("b");
    expect(cutAt(reel, 99)?.shot.id).toBe("b");
  });
});

describe("poseAt", () => {
  const path = shot("a", 10).camera;

  it("hits the first and last keyframes exactly", () => {
    expect(poseAt(path, 0).position).toEqual([0, 10, 100]);
    expect(poseAt(path, 10).position.map((v) => Math.round(v * 1000) / 1000)).toEqual([20, 30, 80]);
  });

  it("does not stop at an inner keyframe", () => {
    const step = (t: number) => {
      const a = poseAt(path, t - 0.05).position;
      const b = poseAt(path, t + 0.05).position;
      return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    };
    // Around the middle keyframe the camera keeps moving at roughly cruise speed.
    expect(step(5)).toBeGreaterThan(step(3) * 0.5);
  });

  it("eases in at the start", () => {
    const moved = (t: number) => Math.hypot(...poseAt(path, t).position.map((v, i) => v - path.keyframes[0].position[i]));
    expect(moved(0.1)).toBeLessThan(moved(0.5) / 5);
  });
});

describe("flightProblems", () => {
  it("passes a planned reel and flags a whip pan", () => {
    const reel = planReel([shot("a", 6), shot("b", 8)], box);
    expect(flightProblems(reel, box, [])).toEqual([]);
    const whip = {
      path: { fov: 40, keyframes: [
        { t: 0, position: [0, 50, 200] as [number, number, number], target: [0, 10, 0] as [number, number, number] },
        { t: 0.5, position: [0, 50, -200] as [number, number, number], target: [0, 10, 0] as [number, number, number] },
      ] },
      cuts: [],
      duration: 0.5,
    };
    expect(flightProblems(whip, box, []).join("\n")).toMatch(/faster than/);
  });
});
