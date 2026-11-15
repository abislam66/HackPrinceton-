import { describe, expect, it } from "vitest";
import { buildingSides, PLACEHOLDER_BOUNDING_BOX, type ModelMetadata } from "@/features/model/schema";
import { checkCameraPath, compileCameraPath, compileShot, compileShotList, lensToFov, obstaclesFromProject, segmentHitsBox } from "./compile";
import { shotMoves, type ShotIntent } from "./intent";
import { shotListSchema } from "./schema";

type Box = ModelMetadata["boundingBox"];

const boxes: Record<string, Box> = {
  placeholder: PLACEHOLDER_BOUNDING_BOX,
  tallThin: { min: [-3, 0, -2], max: [3, 120, 4] },
  longFlat: { min: [-90, 0, -8], max: [90, 12, 8] },
  offCenter: { min: [10, 2, -40], max: [50, 20, -25] },
};

function intent(overrides: Partial<ShotIntent> = {}): ShotIntent {
  return {
    name: "Test shot",
    description: "Frames the face.",
    platform: "drone",
    lens: "35mm",
    timeOfDay: "golden hour",
    constructionPhase: "facade install",
    side: "south",
    move: "rise",
    distance: 2,
    height: 0.8,
    durationSec: 6,
    ...overrides,
  };
}

describe("compileCameraPath invariants", () => {
  for (const [boxName, box] of Object.entries(boxes)) {
    for (const side of buildingSides) {
      for (const move of shotMoves) {
        it(`${move} on ${side} of ${boxName}`, () => {
          for (const distance of [1.2, 2.5, 4]) {
            for (const height of [0, 0.8, 1.6]) {
              const path = compileCameraPath(intent({ side, move, distance, height }), box);
              expect(checkCameraPath(path, box)).toEqual([]);
              expect(path.keyframes.length).toBeGreaterThanOrEqual(3);
              expect(path.keyframes[0].t).toBe(0);
              expect(path.keyframes.at(-1)!.t).toBe(6);
            }
          }
        });
      }
    }
  }

  it("keeps ground-hero at eye height", () => {
    const path = compileCameraPath(intent({ move: "ground-hero" }), PLACEHOLDER_BOUNDING_BOX);
    for (const k of path.keyframes) expect(k.position[1]).toBe(1.6);
  });

  it("puts the camera on the named side", () => {
    const box = PLACEHOLDER_BOUNDING_BOX;
    const at = (side: ShotIntent["side"]) => compileCameraPath(intent({ side, move: "push-in" }), box).keyframes[0].position;
    expect(at("north")[2]).toBeLessThan(box.min[2]);
    expect(at("south")[2]).toBeGreaterThan(box.max[2]);
    expect(at("east")[0]).toBeGreaterThan(box.max[0]);
    expect(at("west")[0]).toBeLessThan(box.min[0]);
  });
});

describe("checkCameraPath", () => {
  it("flags a camera inside the building, below 1 m, aimed away, or out of order", () => {
    const problems = checkCameraPath(
      {
        fov: 40,
        keyframes: [
          { t: 0, position: [0, 10, 0], target: [0, 10, 0] },
          { t: 0, position: [100, 0.5, 100], target: [500, 0, 500] },
        ],
      },
      PLACEHOLDER_BOUNDING_BOX,
    );
    expect(problems.join("\n")).toMatch(/within 2 m/);
    expect(problems.join("\n")).toMatch(/below 1 m/);
    expect(problems.join("\n")).toMatch(/target more than 5 m/);
    expect(problems.join("\n")).toMatch(/time does not increase/);
  });
});

describe("lensToFov", () => {
  it("maps common focal lengths", () => {
    expect(Math.round(lensToFov("24mm wide"))).toBe(74);
    expect(Math.round(lensToFov("35mm"))).toBe(54);
    expect(Math.round(lensToFov("50 mm"))).toBe(40);
    expect(Math.round(lensToFov("70mm tele"))).toBe(29);
  });

  it("defaults and clamps", () => {
    expect(lensToFov("wide")).toBe(40);
    expect(lensToFov("2mm fisheye")).toBe(120);
    expect(lensToFov("800mm")).toBe(5);
  });
});

describe("side filter", () => {
  it("drops a shot on a side without real reference", () => {
    const result = compileShot(intent({ side: "north" }), {
      boundingBox: PLACEHOLDER_BOUNDING_BOX,
      knownSides: ["south", "east"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons[0]).toMatch(/no real reference/);
  });
});

describe("compileShotList", () => {
  const model = { boundingBox: PLACEHOLDER_BOUNDING_BOX, knownSides: ["south", "east"] as const };

  it("gives stable ids, keeps at most five, and parses with shotListSchema", () => {
    const intents = [
      intent({ side: "north", name: "dropped" }),
      ...Array.from({ length: 6 }, (_, i) => intent({ name: `kept ${i}`, side: i % 2 ? "east" : "south" })),
    ];
    const { shots, dropped } = compileShotList(intents, { ...model, knownSides: [...model.knownSides] }, "client-a");
    expect(shots.map((s) => s.id)).toEqual([1, 2, 3, 4, 5].map((n) => `client-a-shot-${n}`));
    expect(shots[0].name).toBe("kept 0");
    expect(dropped).toHaveLength(1);
    expect(shotListSchema.safeParse(shots).success).toBe(true);
  });
});

describe("neighbors", () => {
  const box = PLACEHOLDER_BOUNDING_BOX;
  // A 30 m tall block 60-80 m south of the face: in the way of low views from far out.
  const wall = { name: "Test Hall", min: [-60, 0, 75] as [number, number, number], max: [60, 30, 95] as [number, number, number] };

  it("detects a segment crossing a box, and one passing over it", () => {
    expect(segmentHitsBox([0, 5, 200], [0, 5, 15], wall)).toBe(true);
    expect(segmentHitsBox([0, 60, 200], [0, 40, 15], wall)).toBe(false);
  });

  it("flags a far, low shot that a neighbor blocks", () => {
    const path = compileCameraPath(intent({ move: "push-in", distance: 4, height: 0.1 }), box);
    expect(checkCameraPath(path, box, [wall]).join("\n")).toMatch(/Test Hall/);
  });

  it("adjusts a blocked shot until it is clear, or drops it with the reason", () => {
    const model = { boundingBox: box, knownSides: ["south" as const] };
    for (const move of shotMoves) {
      const result = compileShot(intent({ move, distance: 3, height: 0.2 }), model, [wall]);
      if (result.ok) expect(checkCameraPath(result.shot.camera, box, [wall])).toEqual([]);
      else expect(result.reasons.join("\n")).toMatch(/Test Hall/);
    }
  });

  it("places neighbors in the model builder's frame and skips the subject building", () => {
    // A 0.001° square site with a neighbor 0.002° east; the site maps onto the model box.
    const site = [[-75.0005, 40.0005], [-74.9995, 40.0005], [-74.9995, 39.9995], [-75.0005, 39.9995]];
    const east = [[-74.9985, 40.0002], [-74.9975, 40.0002], [-74.9975, 39.9998], [-74.9985, 39.9998]];
    const half = 0.0005 * 111_320 * Math.cos((40 * Math.PI) / 180);
    const siteBox = { min: [-half, 0, -55] as [number, number, number], max: [half, 50, 55] as [number, number, number] };
    const obstacles = obstaclesFromProject(
      { footprint: site, context: [{ footprint: site, heightM: 50 }, { footprint: east, levels: 5, name: "East Hall" }] },
      siteBox,
    );
    expect(obstacles).toHaveLength(1);
    expect(obstacles[0].name).toBe("East Hall");
    expect(obstacles[0].max[1]).toBeCloseTo(16);
    expect(obstacles[0].min[0]).toBeGreaterThan(half);
  });

  it("returns no obstacles without context", () => {
    expect(obstaclesFromProject({}, box)).toEqual([]);
    expect(obstaclesFromProject(null, box)).toEqual([]);
  });
});
