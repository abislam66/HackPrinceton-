import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/*
 * The Agent tab's model call. A plain chat for now: no tools, no data access, no scope rules.
 * To extend it, add tools to `tools` and handle tool_use in `agentReply`, or add context to SYSTEM.
 */

const MODEL = "claude-opus-5-5";
const TIMEOUT_MS = 30_000;

const SYSTEM = `You are the Tradesmark agent, an assistant inside Tradesmark's internal Project Proposal System. Tradesmark films and documents construction projects. Answer the team's questions plainly and briefly. If you don't know something, say so instead of guessing.`;

export const MAX_MESSAGES = 40;
export const MAX_MESSAGE_CHARS = 8000;

/** One turn in the thread, as the browser sends it. */
export const agentMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
});
export const agentRequestSchema = z.object({
  messages: z
    .array(agentMessageSchema)
    .min(1)
    .max(MAX_MESSAGES)
    // Zod still runs this when min(1) has failed, so guard the empty array.
    .refine((m) => m.length > 0 && m[0].role === "user" && m.at(-1)?.role === "user", "The thread must start and end with a user message"),
});
export type AgentMessage = z.infer<typeof agentMessageSchema>;

export class AgentError extends Error {}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Reads ANTHROPIC_API_KEY from the environment. Never logged, never sent to the browser.
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  return client;
}

/** Returns the model's reply to the thread. Throws AgentError on a refusal or an API failure. */
export async function agentReply(messages: AgentMessage[]): Promise<string> {
  let response;
  try {
    response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 4000,
      speed: "fast",
      output_config: { effort: "low" },
      system: SYSTEM,
      messages,
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) throw new AgentError(`The model call failed: ${error.message}`);
    throw error;
  }
  if (response.stop_reason === "refusal") throw new AgentError("The model declined to answer that.");
  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n")
    .trim();
  if (!text) throw new AgentError("The model returned no text.");
  return text;
}
