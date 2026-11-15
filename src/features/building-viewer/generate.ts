import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { buildScene, sceneSchema, type BuildingScene, type Obstacle } from "@/features/model/scene";
import { exportGlb } from "@/features/model/scene-glb";
import { buildingSides, type ModelMetadata } from "@/features/model/schema";
import { fetchContext, geocodeAddress, type ContextItem } from "./geo";
import { sideSummary, slugFrom, validateModelJson } from "./model-json";
import { assembleViewer, fillTemplate, parseReply, parseSceneBlock, type PromptValues } from "./prompt";
import type { PhotoMediaType, ViewerInput, ViewerResult, ViewerStep, ViewerEvent } from "./schema";

/*
 * The generator: geocode, then the model call (with the map context fetched alongside it), then the build. Claude
 * returns the building as a JSON scene (src/features/model/scene.ts), never code. Trusted server code builds the
 * three.js scene from it, adds the OpenStreetMap neighbours, exports the GLB and embeds that GLB in the locked
 * scaffold page. Logs step names, statuses and timings only: never keys, photos, prompts or the address.
 */

export const MODEL = "claude-opus-5-5";
export const MAX_OUTPUT_TOKENS = 16000;
/**
 * The whole run must end inside the routes' maxDuration (300 s), or the host kills it before it can record a failure.
 * One deadline, counted from the start: the model call gets what is left of it, and the SDK does not retry (a retry
 * would restart its own timeout).
 */
export const RUN_BUDGET_MS = 270_000;
/** Kept back from the model call for the scene retry, the build and the saves. */
export const FINISH_RESERVE_MS = 55_000;
export const WEB_SEARCH_MAX_USES = 3;
/** The scene retry is small: the scene and its errors, no web search. */
export const RETRY_TIMEOUT_MS = 40_000;
/** The models bucket's per-file limit (supabase/migrations/20261115120000_models_bucket.sql). */
export const MAX_GLB_BYTES = 4 * 1024 * 1024;

export class StepError extends Error {
  constructor(public readonly step: ViewerStep | "model_call", message: string) {
    super(message);
  }
}

type Emit = (event: ViewerEvent) => void;
type Photo = { bytes: Uint8Array; mediaType: PhotoMediaType };

/** Everything a run makes: the event the page shows, plus the model to save on the project. */
export type GeneratedViewer = {
  result: ViewerResult;
  glb: Uint8Array;
  boundingBox: ModelMetadata["boundingBox"];
  obstacles: Obstacle[];
  scene: BuildingScene;
};

async function readAsset(name: string): Promise<string> {
  return readFile(path.join(process.cwd(), "building-viewer", name), "utf8");
}

function observedFacts(input: ViewerInput): string {
  return input.knownFacts ? input.knownFacts : "none provided";
}

export const MODEL_RULES = `Map context is fetched by the backend and added to the model by the server. Do not fetch map data or describe neighbouring buildings.
You may use web search for building facts only (height, floors, footprint, massing, materials, the building's name). Do not search for anything else.`;

/** A scene that passes the schema, or the errors to send back. */
export function checkScene(raw: unknown): { ok: true; scene: BuildingScene } | { ok: false; errors: string[] } {
  if (raw === null || typeof raw !== "object") return { ok: false, errors: ["the scene is not a JSON object"] };
  const parsed = sceneSchema.safeParse(raw);
  if (parsed.success) return { ok: true, scene: parsed.data };
  return { ok: false, errors: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".") || "scene"}: ${i.message}`) };
}

export async function generateViewer(input: ViewerInput, photo: Photo | null, emit: Emit): Promise<GeneratedViewer> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new StepError("model", "Generation isn't connected: ANTHROPIC_API_KEY is not set.");
  const deadline = Date.now() + RUN_BUDGET_MS;

  // 1. Geocode. A failure continues with no coordinates.
  emit({ type: "step", step: "geocode", status: "start" });
  const t0 = Date.now();
  const geo = await geocodeAddress(input.address, process.env.GOOGLE_MAPS_KEY);
  logStep("geocode", geo.status, t0);
  emit({ type: "step", step: "geocode", status: "done", detail: geo.status });

  // 2. Nearby buildings, fetched while the model works: the server adds them, so the model doesn't wait for them.
  emit({ type: "step", step: "context", status: "start" });
  const t1 = Date.now();
  const contextWork = geo.point
    ? // Retries until a deadline, but never makes a run wait more than 3 minutes for its surroundings.
      fetchContext(geo.point, Date.now(), Math.min(deadline - 20_000, Date.now() + 180_000)).then((context) => {
        logStep("context", context.status, t1);
        return context;
      })
    : Promise.resolve({ items: [] as ContextItem[], streets: [], status: "not retrieved" as const });

  // 3. The model call, with the optional photo.
  emit({ type: "step", step: "model", status: "start" });
  const t2 = Date.now();
  const template = await readAsset("house_viewer_prompt.md");
  const values: PromptValues = {
    project_name: input.buildingName || input.address,
    address: input.address,
    lat: geo.point ? geo.point.lat.toFixed(6) : "unknown",
    lng: geo.point ? geo.point.lng.toFixed(6) : "unknown",
    geocode_status: geo.status,
    observed_facts: observedFacts(input),
    user_notes: input.notes || "none",
    photo_status: photo ? "attached" : "none",
  };
  const prompt = fillTemplate(template, values);
  let text: string;
  try {
    text = await callModel(apiKey, `${MODEL_RULES}\n\n${prompt}`, photo, deadline - FINISH_RESERVE_MS - Date.now());
  } catch (error) {
    // The context fetch keeps running in the background otherwise; it only fills the cache.
    void contextWork.catch(() => undefined);
    throw error;
  }
  let parsed: ReturnType<typeof parseReply>;
  try {
    parsed = parseReply(text);
  } catch {
    throw new StepError("model", "The model's answer had no reply. Try again.");
  }
  logStep("model", "ok", t2);
  emit({ type: "step", step: "model", status: "done" });

  const context = await contextWork;
  emit({ type: "step", step: "context", status: geo.point ? "done" : "skipped", detail: context.status });

  // 4. Build: check the scene (one retry with the errors), build it with the neighbours, export the GLB, make the page.
  emit({ type: "step", step: "assemble", status: "start" });
  const t3 = Date.now();
  let checked = parsed.scene === null ? { ok: false as const, errors: [parsed.sceneError ?? "no scene"] } : checkScene(parsed.scene);
  let sceneStatus = "generated";
  if (!checked.ok) {
    console.info(`building-viewer scene invalid, retrying: ${checked.errors.length} errors`);
    const retryText = await callSceneRetry(apiKey, retryPrompt(parsed.sceneText, checked.errors), Math.min(RETRY_TIMEOUT_MS, deadline - 10_000 - Date.now()));
    const second = retryText === null ? null : parseSceneBlock(retryText);
    const again = second?.scene ? checkScene(second.scene) : null;
    if (!again?.ok) {
      logStep("assemble", "scene invalid after retry", t3);
      throw new StepError("assemble", "The model's building description didn't check out, even after a retry. Try again.");
    }
    checked = again;
    sceneStatus = "generated on retry";
  }
  const scene = checked.scene;
  const built = buildScene(scene, context.items, context.streets);
  const glb = await exportGlb(built.root);
  if (glb.length > MAX_GLB_BYTES) {
    logStep("assemble", `glb too large bytes=${glb.length}`, t3);
    throw new StepError("assemble", "The building came out too detailed to save (over 4 MB). Try again.");
  }
  const scaffold = await readAsset("scaffold.html");
  const html = assembleViewer(scaffold, scene.title, glb);

  const projectSlug = input.projectSlug || slugFrom(input.buildingName || input.address);
  const model = validateModelJson({ boundingBox: built.boundingBox, knownSides: [...buildingSides] }, projectSlug);
  if (!model.ok) {
    logStep("assemble", "bounding box out of range", t3);
    throw new StepError("assemble", `The building came out the wrong size (${model.errors.join("; ")}). Try again.`);
  }
  logStep("assemble", `${sceneStatus} parts=${scene.parts.length} neighbours=${built.obstacles.length} streets=${context.streets.length} glb_bytes=${glb.length}`, t3);
  emit({ type: "step", step: "assemble", status: "done" });

  // Generated projects allow shots on every side. A photo backs some of them; the reply says so.
  const sides = { photo: [] as ModelMetadata["knownSides"], inferred: [...buildingSides] };
  return {
    result: {
      type: "result",
      html,
      reply: `${parsed.reply}\n\nSurroundings: ${context.status === "retrieved" ? `${built.obstacles.length} buildings and ${context.streets.length} streets from OpenStreetMap` : "not retrieved"}. Sides for shots: ${sideSummary(sides)}.`,
      geocode_status: geo.status,
      context_status: context.status,
      drift: false,
      model_json: model.model,
      model_json_status: sceneStatus,
      project_slug: projectSlug,
      sides,
      model_saved: false,
    },
    glb,
    boundingBox: built.boundingBox,
    obstacles: built.obstacles,
    scene,
  };
}

/** The prompt for the one retry: the scene Claude wrote, what failed, and the format again. No web search. */
export function retryPrompt(sceneText: string, errors: string[]): string {
  return `You described a building as this JSON scene for a 3D massing model:

${sceneText.slice(0, 40_000) || "(nothing parseable)"}

It failed validation:
${errors.map((e) => `- ${e}`).join("\n")}

Return the corrected scene inside <scene_json></scene_json>, nothing else. Keep the same building. Rules: keys title,
materials (1 to 6, lowercase names, each with type "toon" or "curtain" and light and shade colours as #RRGGBB) and parts
(each with shape "box" + size [w, h, d], "cylinder" + radius and height, or "prism" + footprint [[x, z], ...] and height;
plus at [x, base y, z], mat naming a material, basis "observed" or "inferred", optional rotY in degrees (positive is
counter-clockwise seen from above), optional
repeat {count, step [dx, dy, dz]}). Metres, +Y up, +X east, -Z north, footprint centred on the origin, base at y = 0.
No comments inside the JSON.`;
}

/** The one retry for an invalid scene: a short call with the scene and its errors. Null if the call fails. */
async function callSceneRetry(apiKey: string, instructions: string, timeoutMs: number): Promise<string | null> {
  if (timeoutMs < 5_000) return null;
  const client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 0 });
  const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: instructions }];
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 12000,
      output_config: { effort: "low" },
      messages: [{ role: "user", content }],
    });
    return response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  } catch (error) {
    console.error(`building-viewer scene retry failed: ${(error as Error).name}`);
    return null;
  }
}

async function callModel(apiKey: string, instructions: string, photo: Photo | null, timeoutMs: number): Promise<string> {
  // No SDK retry: a retry restarts the timeout and would run past the route's limit.
  const client = new Anthropic({ apiKey, timeout: Math.max(timeoutMs, 30_000), maxRetries: 0 });
  const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: instructions }];
  if (photo) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: photo.mediaType, data: Buffer.from(photo.bytes).toString("base64") },
    });
  }
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      output_config: { effort: "low" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: WEB_SEARCH_MAX_USES }],
      messages: [{ role: "user", content }],
    });
  } catch (error) {
    console.error(`building-viewer model call failed: ${(error as Error).name}`);
    throw new StepError("model", "The model call failed. Try again in a minute.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new StepError("model", "The model's answer was cut off. Try again, or give it fewer notes.");
  }
  const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  if (!text.trim()) throw new StepError("model", "The model returned no text.");
  return text;
}

function logStep(step: string, status: string, startedAt: number) {
  console.info(`building-viewer step=${step} status=${status} ms=${Date.now() - startedAt}`);
}
