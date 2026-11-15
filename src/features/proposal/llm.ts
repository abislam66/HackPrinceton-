import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/*
 * The one place generation talks to the LLM. Output is constrained to a Zod schema with
 * structured outputs, then parsed again with the same schema before anyone uses it.
 *
 * Claude Opus 5.5 rejects forced tool_choice and sampling parameters (temperature), so tone
 * is set in the system prompt and the shape by output_config.format.
 */

const MODEL = "claude-opus-5-5";
/** Per call. The whole proposal has a 25 s budget, so a slow call fails fast. */
const TIMEOUT_MS = 15_000;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Reads ANTHROPIC_API_KEY from the environment. Never logged, never sent to the browser.
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
  return client;
}

export class LlmError extends Error {}

type Options = {
  /** Thinking depth. Opus 5.5 always thinks; low keeps generation inside the demo budget. */
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
};

/**
 * Asks the model for one object matching `schema`. If the reply doesn't parse, retries once
 * with the validation error in the prompt. Throws LlmError when it still fails or is refused.
 */
export async function callStructured<T extends z.ZodType>(
  schema: T,
  system: string,
  user: string,
  { effort = "low", maxTokens = 8000 }: Options = {},
): Promise<z.infer<T>> {
  let lastProblem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const content =
      attempt === 0
        ? user
        : `${user}\n\nYour previous answer was rejected: ${lastProblem}\nReturn a corrected answer.`;
    let response;
    try {
      response = await getClient().beta.messages.parse({
        model: MODEL,
        max_tokens: maxTokens,
        // Re-runs a declined request on Anthropic's recommended fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        messages: [{ role: "user", content }],
        output_config: { effort, format: betaZodOutputFormat(schema) },
      });
    } catch (error) {
      // HTTP, timeout and connection errors are not worth a second try inside the budget.
      if (error instanceof Anthropic.APIError) throw new LlmError(`LLM call failed: ${error.message}`);
      // The SDK's own parse step throws when the JSON doesn't match the schema: retry once.
      lastProblem = (error as Error).message;
      continue;
    }

    if (response.stop_reason === "refusal") {
      throw new LlmError(`Model declined the request (${response.stop_details?.category ?? "no category"})`);
    }
    if (response.stop_reason === "max_tokens") {
      lastProblem = "the answer was cut off; keep it shorter.";
      continue;
    }
    const result = schema.safeParse(response.parsed_output);
    if (result.success) return result.data;
    lastProblem = result.error.message;
  }
  throw new LlmError(`Model output did not match the schema: ${lastProblem}`);
}
