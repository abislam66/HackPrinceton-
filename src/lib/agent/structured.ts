import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { modelFor, supportsServerFallback } from "./models";
import { AgentAbortedError, AgentError, hasAnthropicKey } from "./research";

/*
 * Phase 2 of a live stage (extraction, on Haiku) and the outreach drafter (on Sonnet): one call
 * whose output is constrained to a Zod schema, then parsed again with the same schema. The
 * models are set per job in ./models.ts.
 */

const TIMEOUT_MS = 90_000;
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // One automatic retry on rate limits and server errors.
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  return client;
}

type Options = {
  /** Which job this call does; picks the model. */
  job?: "extract" | "draft";
  /** Defaults: medium for extraction (accuracy of the cited ids), low for drafting. */
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  signal?: AbortSignal;
};

/**
 * Asks for one object matching `schema`. Retries once with the validation error when the reply
 * does not parse. Throws AgentError when it still fails or is declined.
 */
export async function structured<T extends z.ZodType>(
  schema: T,
  system: string,
  user: string,
  { job = "extract", effort, maxTokens = 16000, signal }: Options = {},
): Promise<z.infer<T>> {
  if (!hasAnthropicKey()) throw new AgentError("ANTHROPIC_API_KEY is not set");
  const model = modelFor(job);
  const fallback = supportsServerFallback(model) ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {};
  let lastProblem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const content =
      attempt === 0 ? user : `${user}\n\nYour previous answer was rejected: ${lastProblem}\nReturn a corrected answer.`;
    let response;
    try {
      response = await getClient().beta.messages.parse(
        {
          model,
          max_tokens: maxTokens,
          ...fallback,
          system,
          messages: [{ role: "user", content }],
          output_config: {
            effort: effort ?? (job === "extract" ? "medium" : "low"),
            format: betaZodOutputFormat(schema),
          },
        },
        { signal },
      );
    } catch (error) {
      if (signal?.aborted) throw new AgentAbortedError("The run passed its deadline");
      if (error instanceof Anthropic.APIError) throw new AgentError(`${job} call failed: ${error.message}`);
      // The SDK's parse step throws when the JSON does not match the schema: retry once.
      lastProblem = (error as Error).message;
      continue;
    }
    if (response.stop_reason === "refusal") {
      throw new AgentError(`The model declined the request (${response.stop_details?.category ?? "no category"})`);
    }
    if (response.stop_reason === "max_tokens") {
      lastProblem = "the answer was cut off; keep it shorter.";
      continue;
    }
    const result = schema.safeParse(response.parsed_output);
    if (result.success) return result.data;
    lastProblem = result.error.message;
  }
  throw new AgentError(`Model output did not match the schema: ${lastProblem}`);
}
