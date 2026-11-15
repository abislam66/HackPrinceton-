import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { APP_TOOLS_PROMPT, createAppTools } from "@/features/agent-tools/app-tools";
import { createPipelineTools, PIPELINE_TOOLS_PROMPT } from "@/features/agent-tools/tools";
import { applyScenario, MAX_CHANGE_CHARS } from "@/features/proposal/scenario";

/*
 * The Agent tab's model call. The chat model orchestrates Rafiat's live pipeline tools (scouting,
 * dossiers, outreach, sample progress) and the rest of the app (projects, models, proposals,
 * tracking; ../agent-tools/app-tools.ts) through the SDK tool runner; the research runs inside the
 * tools. Events stream back while it works, so the chat can show which tool is running.
 */

/** Sonnet keeps the chat cheap; the tools pick their own models. */
const MODEL = "claude-sonnet-5-5";
/** A scout or dossier can take a few minutes; the route's maxDuration is the hard stop. */
const TIMEOUT_MS = 280_000;
/** Tool rounds per prompt, so a confused run can't loop forever. Room for "scout, add, research, model" in one ask. */
const MAX_ITERATIONS = 12;

/** Re-pitching from a described change; the generation pipeline does the work. */
const SCENARIO_PROMPT = `Re-pitching (regenerate_proposal): when the team describes a change in a stakeholder (what they need, who they are) or in the project's goals or projections, call regenerate_proposal with that client's id (from list_stakeholders) and the change in the team's words. It rebuilds that client's shots and pitch and saves them as a draft for review; tell the user what changed and link the proposal page. It takes about 15 seconds.`;

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

const regenerateProposalTool = betaZodTool({
  name: "regenerate_proposal",
  description:
    "Rebuilds one stakeholder's proposal (shots and pitch) from a described change in that stakeholder or in the project's goals, and saves it as a draft for review. Takes about 15 seconds.",
  inputSchema: z.object({
    clientId: z.string().regex(/^[a-z0-9-]+$/).describe("The stakeholder's id from list_stakeholders, e.g. client-a"),
    change: z.string().min(5).max(MAX_CHANGE_CHARS).describe("The change, in the team's words"),
  }),
  run: async ({ clientId, change }) => {
    try {
      const result = await applyScenario(clientId, change);
      if (!result) return `Error: unknown stakeholder ${clientId}. Use list_stakeholders for the ids.`;
      const { scenario, proposal } = result;
      return JSON.stringify({
        clientId,
        whatChanged: scenario.summary,
        need: scenario.need,
        focus: scenario.focusElements,
        projectUpdate: scenario.projectUpdate || null,
        teaser: proposal.pitch.teaserLine,
        headline: proposal.pitch.headline,
        shots: proposal.shots.map((s) => `${s.name} (${s.side})`),
        status: "draft, waiting for review",
        proposalPage: `/proposals/${clientId}?preview=1`,
      });
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

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
    system: `${SYSTEM}\n\n${PIPELINE_TOOLS_PROMPT}\n\n${APP_TOOLS_PROMPT}\n\n${SCENARIO_PROMPT}`,
    tools: [
      ...createPipelineTools({
        onProgress: (p) => emit({ type: "progress", tool: p.tool, message: p.message }),
      }),
      regenerateProposalTool,
      ...createAppTools(),
    ],
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
