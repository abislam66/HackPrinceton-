import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessageParam,
  BetaToolUnion,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { SourceLedger } from "./ledger";
import { modelFor, supportsServerFallback } from "./models";
import type { ProgressFn } from "./schema";

/*
 * Phase 1 of every live stage: a research loop on Claude with Anthropic's server-side web tools.
 * The tools run on Anthropic's side, so one request can search and read several pages; we only
 * watch the stream, number every page the tools return (the source ledger) and keep the text.
 * Phase 2 (./structured.ts) turns that text into the stage's schema, citing ledger ids.
 */

/** A research call searches and reads pages server-side; give it room, but not forever. */
const REQUEST_TIMEOUT_MS = 180_000;
/** A long server-side tool loop stops with `pause_turn`; resend at most this many times. */
const MAX_RESUMES = 2;
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export class AgentError extends Error {}
export class AgentAbortedError extends AgentError {}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Reads ANTHROPIC_API_KEY from the environment. Never logged, never sent to the browser.
  client ??= new Anthropic({ timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  return client;
}

/** True when a key is set. Without one every live run falls back to its snapshot. */
export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export type ResearchOptions = {
  system: string;
  prompt: string;
  /** web_search calls allowed in this request. Each one is a few seconds; 3-5 is plenty. */
  maxSearches: number;
  /** web_fetch calls allowed. 0 leaves the fetch tool out (search snippets only, much faster). */
  maxFetches?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
  /** Biases search results toward a place. */
  userLocation?: { city?: string; region?: string; country?: string; timezone?: string };
  effort?: "low" | "medium" | "high";
  signal?: AbortSignal;
  onProgress?: ProgressFn;
  /** Tags this call's progress lines, e.g. a region id when several run in parallel. */
  scope?: string;
  /** Share one ledger across parallel calls so source ids stay unique within a run. */
  ledger?: SourceLedger;
};

export type ResearchResult = {
  /** The model's notes, with "[S3]"-style markers after every passage that cites a page. */
  text: string;
  ledger: SourceLedger;
  /** Ledger ids of every page this call returned or cited (the ledger may be shared). */
  sourceIds: string[];
  queries: string[];
  fetched: string[];
};

function trimLine(text: string, max = 110): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export async function research(options: ResearchOptions): Promise<ResearchResult> {
  if (!hasAnthropicKey()) throw new AgentError("ANTHROPIC_API_KEY is not set");
  const { scope, onProgress } = options;
  const ledger = options.ledger ?? new SourceLedger();
  const queries: string[] = [];
  const fetched: string[] = [];
  let text = "";
  const progress: ProgressFn = (p) => onProgress?.({ ...p, scope: p.scope ?? scope });

  // "direct" only: the model calls the tools itself instead of from server-side code. From code,
  // it re-ran the same query until max_uses ran out and the results came back without citations.
  const tools: BetaToolUnion[] = [
    {
      type: "web_search_20260209",
      name: "web_search",
      allowed_callers: ["direct"],
      max_uses: options.maxSearches,
      ...(options.allowedDomains?.length ? { allowed_domains: options.allowedDomains } : {}),
      ...(options.blockedDomains?.length ? { blocked_domains: options.blockedDomains } : {}),
      ...(options.userLocation ? { user_location: { type: "approximate" as const, ...options.userLocation } } : {}),
    },
  ];
  if (options.maxFetches) {
    tools.push({
      type: "web_fetch_20260209",
      name: "web_fetch",
      allowed_callers: ["direct"],
      max_uses: options.maxFetches,
      max_content_tokens: 8000,
    });
  }

  // Every ledger id this call returned or cited, so extraction sees all of this call's pages.
  const touched = new Set<string>();
  const track = (id: string | null) => {
    if (id) touched.add(id);
    return id;
  };
  const seenBlocks = new Set<string>();

  const onBlock = (block: BetaContentBlock) => {
    // A block is reported once; guard against a repeat so the feed never shows a line twice.
    const blockId = "id" in block ? block.id : "tool_use_id" in block ? block.tool_use_id : null;
    if (blockId) {
      const key = `${block.type}:${blockId}`;
      if (seenBlocks.has(key)) return;
      seenBlocks.add(key);
    }
    switch (block.type) {
      case "server_tool_use": {
        if (block.name === "web_search" && typeof block.input.query === "string") {
          const repeat = queries.includes(block.input.query);
          queries.push(block.input.query);
          if (!repeat) progress({ kind: "search", message: `Searching: ${trimLine(block.input.query)}` });
        } else if (block.name === "web_fetch" && typeof block.input.url === "string") {
          fetched.push(block.input.url);
          progress({ kind: "fetch", message: `Reading: ${trimLine(block.input.url)}` });
        }
        break;
      }
      case "web_search_tool_result": {
        if (Array.isArray(block.content)) {
          for (const result of block.content) track(ledger.add(result.url, result.title, result.page_age));
          const titles = block.content.slice(0, 2).map((r) => trimLine(r.title, 60));
          progress({
            kind: "found",
            message: `${block.content.length} results${titles.length ? `: ${titles.join(" · ")}` : ""}`,
          });
        } else {
          progress({ kind: "note", message: `Search failed (${block.content.error_code})` });
        }
        break;
      }
      case "web_fetch_tool_result": {
        if (block.content.type === "web_fetch_result") {
          track(ledger.add(block.content.url, block.content.content.title));
        } else {
          progress({ kind: "note", message: `Could not read a page (${block.content.error_code})` });
        }
        break;
      }
      case "text": {
        const ids = new Set<string>();
        for (const citation of block.citations ?? []) {
          if (citation.type === "web_search_result_location") {
            const id = track(ledger.add(citation.url, citation.title));
            if (id) ids.add(id);
          }
        }
        text += block.text;
        if (ids.size) text += ` [${[...ids].join(", ")}]`;
        break;
      }
      default:
        break;
    }
  };

  const model = modelFor("research");
  // Re-runs a declined request on Anthropic's recommended fallback model, where the model has one.
  const fallback = supportsServerFallback(model) ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {};

  let messages: BetaMessageParam[] = [{ role: "user", content: options.prompt }];
  try {
    for (let turn = 0; ; turn++) {
      const stream = getClient().beta.messages.stream(
        {
          model,
          max_tokens: 16000,
          ...fallback,
          system: options.system,
          messages,
          tools,
          output_config: { effort: options.effort ?? "low" },
        },
        { signal: options.signal },
      );
      stream.on("contentBlock", onBlock);
      const message = await stream.finalMessage();

      if (message.stop_reason === "refusal") {
        throw new AgentError(`The model declined the research request (${message.stop_details?.category ?? "no category"})`);
      }
      if (message.stop_reason === "pause_turn" && turn < MAX_RESUMES) {
        // Send the paused turn back as is; the server resumes from the trailing tool call.
        messages = [...messages, { role: "assistant", content: message.content }];
        continue;
      }
      break;
    }
  } catch (error) {
    if (options.signal?.aborted) throw new AgentAbortedError("The run passed its deadline");
    if (error instanceof AgentError) throw error;
    if (error instanceof Anthropic.APIError) throw new AgentError(`Research call failed: ${error.message}`);
    throw error;
  }

  return { text: text.trim(), ledger, sourceIds: [...touched], queries, fetched };
}
