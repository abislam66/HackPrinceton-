import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createPipelineTools, PIPELINE_TOOLS_PROMPT } from "@/features/agent-tools/tools";

/*
 * The Agent tab's model call. The chat model orchestrates Rafiat's live pipeline tools (scouting,
 * dossiers, outreach, sample progress) through the SDK tool runner; the research runs inside the
 * tools. Events stream back while it works, so the chat can show which tool is running.
 */

/** Sonnet keeps the chat cheap; the tools pick their own models. */
const MODEL = "claude-sonnet-5-5";
/** A scout or dossier can take a few minutes; the route's maxDuration is the hard stop. */
const TIMEOUT_MS = 280_000;
/** Tool rounds per prompt, so a confused run can't loop forever. */
const MAX_ITERATIONS = 8;

const SYSTEM = `You are the Tradesmark agent, an assistant inside Tradesmark's internal Project Proposal System. Tradesmark films and documents construction projects. Answer the team's questions plainly and briefly. If you don't know something, say so instead of guessing. The chat shows plain text, so don't use Markdown: no asterisks, no headings, no tables. For lists, start each line with "- ".`;

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

/** What the chat shows while the agent works, then its answer. One JSON object per line. */
export type AgentEvent =
  | { type: "tool"; tool: string }
  | { type: "progress"; tool: string; message: string }
  | { type: "reply"; text: string }
  | { type: "error"; error: string };

export class AgentError extends Error {}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Reads ANTHROPIC_API_KEY from the environment. Never logged, never sent to the browser.
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  return client;
}

/**
 * Runs the thread through the model and its pipeline tools, calling `emit` as tools start and
 * report progress. Returns the final answer. Throws AgentError on a refusal or an API failure.
 */
export async function agentReply(messages: AgentMessage[], emit: (event: AgentEvent) => void = () => {}): Promise<string> {
  const runner = getClient().beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    max_iterations: MAX_ITERATIONS,
    // Re-runs a declined request on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: `${SYSTEM}\n\n${PIPELINE_TOOLS_PROMPT}`,
    tools: createPipelineTools({
      onProgress: (p) => emit({ type: "progress", tool: p.tool, message: p.message }),
    }),
    messages,
  });

  let last: Anthropic.Beta.BetaMessage | null = null;
  try {
    for await (const message of runner) {
      last = message;
      for (const block of message.content) {
        if (block.type === "tool_use") emit({ type: "tool", tool: block.name });
      }
    }
  } catch (error) {
    if (error instanceof Anthropic.APIError) throw new AgentError(`The model call failed: ${error.message}`);
    throw error;
  }

  if (!last) throw new AgentError("The model returned nothing.");
  if (last.stop_reason === "refusal") throw new AgentError("The model declined to answer that.");
  const text = last.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n")
    .trim();
  if (!text) {
    throw new AgentError(
      last.stop_reason === "tool_use" ? "The agent ran out of steps before answering. Try a narrower request." : "The model returned no text.",
    );
  }
  return text;
}
