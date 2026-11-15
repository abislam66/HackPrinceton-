import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { AgentMessage } from "@/features/agent/chat";
import { MAX_CHANGE_CHARS } from "@/features/proposal/scenario";
import { getProposal } from "@/features/proposal/store";
import { createDraft, DraftError, resolveDraft } from "./drafts";
import { listDrafts, loadProjectClients, loadProjectFacts, type ProjectDraft } from "./store";

/*
 * The project agent: a chat inside one project, the main way to change it. It reads the project's
 * stakeholders and proposals, and turns described changes into drafts (new brief + regenerated
 * shots and pitch). The user then picks Replace, New project or Discard, normally on the draft
 * card; the agent only resolves a draft when the user explicitly asks it to.
 */

const MODEL = "claude-sonnet-5-5";
const TIMEOUT_MS = 110_000;
const MAX_ITERATIONS = 8;

/** A draft as the chat card shows it. */
export type DraftCard = {
  id: string;
  kind: ProjectDraft["kind"];
  clientId: string;
  company: string;
  summary: string;
  status: ProjectDraft["status"];
  teaserLine: string;
  headline: string;
  shots: string[];
  newProjectId?: string;
};

export type ProjectAgentEvent =
  | { type: "tool"; tool: string }
  | { type: "progress"; tool: string; message: string }
  | { type: "draft"; draft: DraftCard }
  | { type: "reply"; text: string }
  | { type: "error"; error: string };

export class ProjectAgentError extends Error {}

export function draftCard(d: ProjectDraft): DraftCard {
  return {
    id: d.id,
    kind: d.kind,
    clientId: d.clientId,
    company: d.client.company,
    summary: d.scenario.summary,
    status: d.status,
    teaserLine: d.proposal.pitch.teaserLine,
    headline: d.proposal.pitch.headline,
    shots: d.proposal.shots.map((s) => s.name),
    newProjectId: d.newProjectId,
  };
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Reads ANTHROPIC_API_KEY from the environment. Never logged, never sent to the browser.
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  return client;
}

/** Null for an unknown project. Otherwise runs the thread and returns the agent's answer. */
export async function projectAgentReply(
  projectSlug: string,
  messages: AgentMessage[],
  emit: (event: ProjectAgentEvent) => void = () => {},
): Promise<string | null> {
  const project = await loadProjectFacts(projectSlug);
  if (!project) return null;

  const system = `You are the project agent for ${project.name}, inside Tradesmark's internal Project Proposal System. Tradesmark films and documents construction projects, and pitches each stakeholder a tailored proposal (shots and pitch). You work on this one project only.

Project facts: ${project.summary} Timeline: ${project.timeline}

How you change the project:
- When the team describes a change in a stakeholder (what they need, who they are), in the project's goals or projections, or a new stakeholder, call draft_change. Pass the stakeholder's id for a change to an existing one (use list_stakeholders); omit it for a new stakeholder.
- A draft changes nothing yet. Tell the user what the draft changes, and that they choose on the draft card: Replace (update this project's stakeholder and proposal), New project (keep this project as it is and open a new one with the change), or Discard.
- Only call resolve_draft if the user explicitly tells you which of those to do in this conversation.
- Never say a change is live until it has been replaced or opened as a new project.
Answer plainly and briefly. The chat shows plain text, so don't use Markdown: no asterisks, headings or tables; for lists start each line with "- ".`;

  const tools = [
    betaZodTool({
      name: "list_stakeholders",
      description: "This project's stakeholders with their current briefs.",
      inputSchema: z.object({}),
      run: async () => {
        const clients = (await loadProjectClients(projectSlug)) ?? [];
        return JSON.stringify(
          clients.map((c) => ({ id: c.id, company: c.company, role: c.role, need: c.need, focus: c.focusElements, notes: c.needsNotes })),
        );
      },
    }),
    betaZodTool({
      name: "get_proposal",
      description: "A stakeholder's current proposal on this project: pitch and shot list.",
      inputSchema: z.object({ clientId: z.string().regex(/^[a-z0-9-]+$/) }),
      run: async ({ clientId }) => {
        const p = await getProposal(clientId, projectSlug);
        if (!p) return `No proposal yet for ${clientId}.`;
        return JSON.stringify({
          status: p.status,
          teaser: p.pitch.teaserLine,
          headline: p.pitch.headline,
          problem: p.pitch.problem,
          solution: p.pitch.solution,
          shots: p.shots.map((s) => `${s.name} (${s.side})`),
        });
      },
    }),
    betaZodTool({
      name: "draft_change",
      description:
        "Drafts a change to this project: an existing stakeholder's situation (give clientId), the project's goals, or a new stakeholder (omit clientId). Regenerates that stakeholder's shots and pitch into a draft. Changes nothing until the user resolves it. Takes about 15 seconds.",
      inputSchema: z.object({
        change: z.string().min(5).max(MAX_CHANGE_CHARS).describe("The change, in the team's words"),
        clientId: z.string().regex(/^[a-z0-9-]+$/).optional().describe("Existing stakeholder id; omit for a new stakeholder"),
      }),
      run: async ({ change, clientId }) => {
        emit({ type: "progress", tool: "draft_change", message: "Rebuilding the brief, shots and pitch" });
        try {
          const draft = await createDraft({ projectSlug, change, clientId });
          const card = draftCard(draft);
          emit({ type: "draft", draft: card });
          return JSON.stringify({ ...card, note: "Draft only. The user chooses Replace, New project or Discard." });
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    }),
    betaZodTool({
      name: "list_drafts",
      description: "This project's drafts, newest first, with their status.",
      inputSchema: z.object({}),
      run: async () => JSON.stringify((await listDrafts(projectSlug)).slice(0, 10).map(draftCard)),
    }),
    betaZodTool({
      name: "resolve_draft",
      description:
        "Applies the user's explicit choice to a pending draft: replace, new-project or discard. Only call this when the user has told you which one in this conversation.",
      inputSchema: z.object({
        draftId: z.string().regex(/^[a-z0-9-]+$/),
        action: z.enum(["replace", "new-project", "discard"]),
      }),
      run: async ({ draftId, action }) => {
        try {
          const draft = await resolveDraft(projectSlug, draftId, action);
          const card = draftCard(draft);
          emit({ type: "draft", draft: card });
          return JSON.stringify(card);
        } catch (error) {
          return `Error: ${error instanceof DraftError || error instanceof Error ? error.message : String(error)}`;
        }
      },
    }),
  ];

  const runner = getClient().beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 8000,
    max_iterations: MAX_ITERATIONS,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system,
    tools,
    messages,
  });

  let last: Anthropic.Beta.BetaMessage | null = null;
  try {
    for await (const message of runner) {
      last = message;
      for (const block of message.content) if (block.type === "tool_use") emit({ type: "tool", tool: block.name });
    }
  } catch (error) {
    if (error instanceof Anthropic.APIError) throw new ProjectAgentError(`The model call failed: ${error.message}`);
    throw error;
  }
  if (!last) throw new ProjectAgentError("The model returned nothing.");
  if (last.stop_reason === "refusal") throw new ProjectAgentError("The model declined to answer that.");
  const text = last.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("\n")
    .trim();
  if (!text) throw new ProjectAgentError("The agent ran out of steps before answering. Try a narrower request.");
  return text;
}
