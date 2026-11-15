import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ModelInfo } from "@/features/model/schema";
import { callStructured } from "@/features/proposal/llm";
import { PROJECT_SLUG, type Client, type Project } from "@/features/project/schema";
import { compileShotList, obstaclesFromProject, type Obstacle } from "./compile";
import { shotIntentSchema, shotMoves, type ShotIntent } from "./intent";
import type { Shot } from "./schema";

/** Default shot count. A generated project asks for more (Abrar: 4 to 6). */
export const DEFAULT_SHOT_COUNT = { min: 3, max: 5 } as const;
/** Fewer than this and the list fails, even after the retry. */
const FLOOR_SHOTS = 3;
const MAX_SHOT_COUNT = 6;

export type ShotCount = { min: number; max: number };

function systemFor(count: ShotCount): string {
  return `You plan drone and ground shots for Tradesmark, a company that films and documents construction projects. You write the shot list our crew will fly, for one client on one building.

Rules:
- Every shot serves this client's need and frames their focus elements. A glazing contractor gets glass, a university gets campus context. Two clients on the same building must get visibly different lists.
- Use only the sides listed in allowedSides. Other sides have no real reference.
- Use only facts from the project and client given. Never invent features of the building.
- You choose the move and framing; code computes the camera path. distance is a multiple of the building's largest dimension (1.2 close, 4 far). height is a multiple of the building's height (0 ground, 1 roofline, 1.6 well above). Neighboring buildings surround the site, so keep shots below the roofline close (distance under 2); far-out views need height to clear them.
- Moves: rise (low near a face, up past the roofline), orbit (60 degree arc around the building), push-in (slow approach to one face), track (slide along a face), reveal (high and top-down, descending to an oblique view), ground-hero (eye level, looking up at a face). Use ground-hero only with platform "ground".
- Vary moves and sides across the list. ${count.min} to ${count.max} shots.
- name: short and specific, under 8 words. description: one or two sentences for the crew on what to frame and why it matters to this client.
- lens like "24mm wide" or "70mm tele". timeOfDay names the light, e.g. "golden hour, low west sun". constructionPhase names when to capture, from the project's timeline. If the timeline says the building is complete, it names the present condition to capture instead (e.g. "completed, occupied, trees in leaf") and never a construction stage.
- Plain, specific language. No marketing words.`;
}

const EXAMPLES = `Examples of the level of specificity wanted (a different building, for illustration only):
- sales-and-bids, a masonry contractor, focus "stone entry arch": {"name":"Arch keystone push-in","description":"Slow approach on the entry arch so the joint work and keystone fill the frame; this is the detail their next bid package needs.","platform":"drone","lens":"70mm tele","timeOfDay":"overcast midday, even light on the stone","constructionPhase":"after scaffolding comes down","side":"south","move":"push-in","distance":1.6,"height":0.3,"durationSec":7}
- community-and-pr, a city library owner, focus "new plaza": {"name":"Plaza reveal from above","description":"Start over the roof and descend to the plaza with people crossing it, showing how the building opens to the street.","platform":"drone","lens":"24mm wide","timeOfDay":"late afternoon, warm side light","constructionPhase":"landscaping complete, before opening","side":"east","move":"reveal","distance":2.5,"height":1.2,"durationSec":9}`;

type Side = ModelInfo["knownSides"][number];

/** The reply shape, with `side` narrowed to the sides that have real reference. */
function responseSchema(knownSides: [Side, ...Side[]], count: ShotCount) {
  return z.object({
    shots: z.array(shotIntentSchema.extend({ side: z.enum(knownSides) })).min(count.min).max(count.max),
  });
}

/** Clamps a requested count to 3..6 with min <= max. */
export function normalizeShotCount(count: ShotCount = DEFAULT_SHOT_COUNT): ShotCount {
  const clampInt = (v: number) => Math.min(Math.max(Math.round(v), FLOOR_SHOTS), MAX_SHOT_COUNT);
  const min = clampInt(count.min);
  return { min, max: Math.max(min, clampInt(count.max)) };
}

/**
 * Generates the drone shots for one client from the model and the client's needs.
 * The LLM picks shot intents; the compiler turns them into camera paths and enforces the
 * invariants. If fewer than `shotCount.min` survive, asks once more with the reasons; after that,
 * three usable shots are enough. `shotCount` defaults to 3 to 5 and is clamped to 3..6.
 */
export async function generateShots(input: {
  project: Project;
  client: Client;
  model: ModelInfo;
  shotCount?: ShotCount;
}): Promise<Shot[]> {
  const { project, client, model } = input;
  const count = normalizeShotCount(input.shotCount);
  const [firstSide, ...otherSides] = model.knownSides;
  if (!firstSide) throw new Error("The model has no side with real reference, so no shot can be framed");
  const schema = responseSchema([firstSide, ...otherSides], count);
  const obstacles = await loadShotObstacles(model.boundingBox);

  const [minX, minY, minZ] = model.boundingBox.min;
  const [maxX, maxY, maxZ] = model.boundingBox.max;
  const brief = {
    project,
    client: {
      company: client.company,
      role: client.role,
      need: client.need,
      needsNotes: client.needsNotes,
      focusElements: client.focusElements,
    },
    allowedSides: model.knownSides,
    allowedMoves: shotMoves,
    buildingSizeMeters: {
      eastWest: round(maxX - minX),
      northSouth: round(maxZ - minZ),
      height: round(maxY - minY),
    },
  };
  const user = `${EXAMPLES}\n\nPlan the shot list for this brief:\n${JSON.stringify(brief, null, 2)}`;

  const system = systemFor(count);
  let intents = await requestIntents(schema, system, user);
  let compiled = compileShotList(intents, model, client.id, obstacles, count.max);
  if (compiled.shots.length < count.min) {
    const reasons = compiled.dropped.map((d) => `"${d.name}": ${d.reasons.join("; ")}`).join("\n");
    intents = await requestIntents(
      schema,
      system,
      `${user}\n\nOnly ${compiled.shots.length} of your shots could be used. These were rejected:\n${reasons}\nReturn a full list that avoids these problems.`,
    );
    compiled = compileShotList(intents, model, client.id, obstacles, count.max);
  }
  if (compiled.shots.length < FLOOR_SHOTS) {
    throw new Error(`Only ${compiled.shots.length} usable shots after a retry`);
  }
  return compiled.shots;
}

async function requestIntents(
  schema: ReturnType<typeof responseSchema>,
  system: string,
  user: string,
): Promise<ShotIntent[]> {
  const { shots } = await callStructured(schema, system, user, { effort: "low", maxTokens: 6000 });
  return shots;
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Neighboring buildings from project.json's `context`, the same ones the model shows. The parsed
 * Project drops these keys, so this reads the file directly. No file or no context means none.
 */
export async function loadShotObstacles(box: ModelInfo["boundingBox"]): Promise<Obstacle[]> {
  try {
    const raw = await readFile(path.join(process.cwd(), "data", PROJECT_SLUG, "project.json"), "utf8");
    return obstaclesFromProject(JSON.parse(raw), box);
  } catch (error) {
    console.error("Could not read neighbors from project.json; shots are checked against the building only.", error);
    return [];
  }
}
