import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { buildingSides } from "@/features/model/schema";
import { fetchContext, geocodeAddress, type ContextItem } from "./geo";
import {
  fallbackModelJson,
  MODEL_JSON_RULES,
  parseModelJsonBlock,
  retryPrompt,
  sideSummary,
  slugFrom,
  validateModelJson,
  type ModelJsonStatus,
} from "./model-json";
import {
  assemble,
  checkSubjectSafety,
  extractSubjectBlock,
  extractTitle,
  fillTemplate,
  hasScaffoldDrift,
  parseReply,
  type PromptValues,
} from "./prompt";
import type { PhotoMediaType, ViewerEvent, ViewerInput, ViewerStep } from "./schema";

/*
 * The generator: geocode, fetch map context, fill the prompt, call the model with the locked scaffold
 * and an optional photo, then splice the model's SUBJECT block into a fresh scaffold. Logs step names,
 * statuses and timings only: never keys, photos, prompts or the address.
 */

export const MODEL = "claude-opus-5-5";
export const MAX_OUTPUT_TOKENS = 16000;
/** Hard stop for the model call; the route's maxDuration is the outer limit. */
export const MODEL_TIMEOUT_MS = 270_000;
export const WEB_SEARCH_MAX_USES = 3;
/** The model.json retry is small and must not push the run past the route's 300 s. */
export const RETRY_TIMEOUT_MS = 20_000;

export class StepError extends Error {
  constructor(public readonly step: ViewerStep | "model_call", message: string) {
    super(message);
  }
}

type Emit = (event: ViewerEvent) => void;

async function readAsset(name: string): Promise<string> {
  return readFile(path.join(process.cwd(), "building-viewer", name), "utf8");
}

function observedFacts(input: ViewerInput): string {
  return input.knownFacts ? input.knownFacts : "none provided";
}

function contextJson(items: ContextItem[]): string {
  return JSON.stringify(items);
}

export const MODEL_RULES = `Map context is pre-fetched by the backend and is already in CONTEXT. Do not fetch map data.
You may use web search for building facts only (height, floors, materials, the building's name). Do not search for anything else.`;

export async function generateViewer(input: ViewerInput, photo: { bytes: Uint8Array; mediaType: PhotoMediaType } | null, emit: Emit) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new StepError("model", "Generation isn't connected: ANTHROPIC_API_KEY is not set.");

  // 1. Geocode. A failure continues with no coordinates.
  emit({ type: "step", step: "geocode", status: "start" });
  const t0 = Date.now();
  const geo = await geocodeAddress(input.address, process.env.GOOGLE_MAPS_KEY);
  logStep("geocode", geo.status, t0);
  emit({ type: "step", step: "geocode", status: "done", detail: geo.status });

  // 2. Nearby buildings. Needs coordinates; without them the context is empty.
  emit({ type: "step", step: "context", status: "start" });
  const t1 = Date.now();
  const context = geo.point
    ? await fetchContext(geo.point)
    : { items: [] as ContextItem[], status: "not retrieved" as const };
  logStep("context", context.status, t1);
  emit({ type: "step", step: "context", status: geo.point ? "done" : "skipped", detail: context.status });

  // 3. The model call, with the locked scaffold and the optional photo.
  emit({ type: "step", step: "model", status: "start" });
  const t2 = Date.now();
  const [template, scaffold] = await Promise.all([readAsset("house_viewer_prompt.md"), readAsset("scaffold.html")]);
  const values: PromptValues = {
    project_name: input.buildingName || input.address,
    address: input.address,
    lat: geo.point ? geo.point.lat.toFixed(6) : "unknown",
    lng: geo.point ? geo.point.lng.toFixed(6) : "unknown",
    geocode_status: geo.status,
    context_json: contextJson(context.items),
    context_status: context.status,
    observed_facts: observedFacts(input),
    user_notes: input.notes || "none",
    photo_status: photo ? "attached" : "none",
  };
  const prompt = fillTemplate(template, values);
  const text = await callModel(
    apiKey,
    `${MODEL_RULES}\n\n${prompt}\n\n${MODEL_JSON_RULES}\n\nLOCKED SCAFFOLD (copy it; change only the SUBJECT block and the title):\n${scaffold}`,
    photo,
  );
  const parsed = parseReply(text);
  logStep("model", "ok", t2);
  emit({ type: "step", step: "model", status: "done" });

  // 4. Assemble: check the subject code, then splice it into a fresh scaffold.
  emit({ type: "step", step: "assemble", status: "start" });
  const t3 = Date.now();
  const subject = extractSubjectBlock(parsed.html);
  checkSubjectSafety(subject);
  const title = extractTitle(parsed.html);
  const drift = hasScaffoldDrift(parsed.html, scaffold);
  const html = assemble(scaffold, subject, title);
  logStep("assemble", drift ? "spliced (model changed locked code)" : "ok", t3);

  // model.json in the model builder's schema: Claude's facts, one retry with the errors, then SUBJECT dims.
  const t4 = Date.now();
  const projectSlug = input.projectSlug || slugFrom(input.buildingName || input.address);
  const first = parseModelJsonBlock(text);
  let model = validateModelJson(first, projectSlug);
  let modelJsonStatus: ModelJsonStatus = "generated";
  if (!model.ok) {
    const retryText = await callModelJsonRetry(apiKey, retryPrompt(subject, model.errors, photo !== null), photo);
    const second = retryText === null ? null : validateModelJson(parseModelJsonBlock(retryText), projectSlug);
    if (second?.ok) {
      model = second;
      modelJsonStatus = "generated on retry";
    } else {
      const sides = (first as { knownSides?: unknown } | null)?.knownSides;
      const fallback = fallbackModelJson(subject, projectSlug, photo ? sides : []);
      model = fallback ? { ok: true, model: fallback } : model;
      modelJsonStatus = fallback ? "built from SUBJECT dims" : "not available";
    }
  }
  logStep("model_json", modelJsonStatus, t4);
  emit({ type: "step", step: "assemble", status: "done" });

  // Generated projects allow shots on every side. The photo backs only some; the reply says which.
  const photoSides = photo && model.ok ? model.model.knownSides : [];
  const sides = {
    photo: buildingSides.filter((side) => photoSides.includes(side)),
    inferred: buildingSides.filter((side) => !photoSides.includes(side)),
  };

  return {
    type: "result" as const,
    html,
    reply: `${parsed.reply}

Sides for shots: ${sideSummary(sides)}.`,
    geocode_status: geo.status,
    context_status: context.status,
    drift,
    model_json: model.ok ? model.model : null,
    model_json_status: modelJsonStatus,
    project_slug: projectSlug,
    sides,
  };
}

/**
 * The one retry for an invalid model.json: a short call with the SUBJECT block and the errors, no web search.
 * Returns null if the call fails, so the caller falls back to SUBJECT dims instead of failing the whole run.
 */
async function callModelJsonRetry(apiKey: string, instructions: string, photo: { bytes: Uint8Array; mediaType: PhotoMediaType } | null): Promise<string | null> {
  const client = new Anthropic({ apiKey, timeout: RETRY_TIMEOUT_MS, maxRetries: 0 });
  const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: instructions }];
  if (photo) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: photo.mediaType, data: Buffer.from(photo.bytes).toString("base64") },
    });
  }
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      output_config: { effort: "low" },
      messages: [{ role: "user", content }],
    });
    return response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  } catch (error) {
    console.error(`building-viewer model_json retry failed: ${(error as Error).name}`);
    return null;
  }
}

async function callModel(apiKey: string, instructions: string, photo: { bytes: Uint8Array; mediaType: PhotoMediaType } | null): Promise<string> {
  const client = new Anthropic({ apiKey, timeout: MODEL_TIMEOUT_MS, maxRetries: 1 });
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
    throw new StepError("model", "The model's page was cut off. Try again, or give it fewer notes.");
  }
  const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  if (!text.trim()) throw new StepError("model", "The model returned no text.");
  return text;
}

function logStep(step: string, status: string, startedAt: number) {
  console.info(`building-viewer step=${step} status=${status} ms=${Date.now() - startedAt}`);
}
