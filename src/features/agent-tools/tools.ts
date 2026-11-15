import "server-only";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaRunnableTool, BetaToolRunContext } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { z } from "zod";
import { runDossier } from "@/features/dossier/dossier";
import { loadDossier } from "@/features/dossier/load";
import type { Dossier } from "@/features/dossier/schema";
import { resolveTarget } from "@/features/dossier/target";
import { draftOutreach, getOutreachOverview, sendOutreach } from "@/features/outreach/actions";
import type { OutreachMessage } from "@/features/outreach/schema";
import { loadClients } from "@/features/project/load";
import { loadScoutResult } from "@/features/scout/load";
import { regionIds, type ScoutResult } from "@/features/scout/schema";
import { runScout } from "@/features/scout/scout";
import { claimRun } from "@/lib/agent/run";
import type { Progress } from "@/lib/agent/schema";
import { writeRecord } from "@/lib/store/json-store";

/*
 * The live pipeline as tools for the general chat agent (the Agent tab). The agent orchestrates;
 * these tools do the work: scouting, dossiers and outreach.
 * They share run guards and storage with the API routes, so a run started from chat shows up on
 * the screens, and two runs of the same thing never overlap.
 *
 * Use with the SDK tool runner:
 *
 *   const runner = client.beta.messages.toolRunner({
 *     model: "claude-sonnet-5-5", max_tokens: 16000,
 *     system: `${yourPrompt}\n\n${PIPELINE_TOOLS_PROMPT}`,
 *     tools: createPipelineTools({ onProgress }),
 *     messages,
 *   });
 *
 * Tool results are compact JSON for the model; the screens read the full records from the GET routes.
 */

const SCOUT_DEADLINE_MS = 150_000;
const DOSSIER_DEADLINE_MS = 180_000;

/** Add to the agent's system prompt so it uses the tools the way the demo needs. */
export const PIPELINE_TOOLS_PROMPT = `You can run Tradesmark's project pipeline with tools:
- Scouting (scout_projects, get_scout_results): real construction projects in five Northeast regions only (New York, Philadelphia and the Main Line, Connecticut, Greater Boston, New Jersey). A live scout takes 1-2 minutes; check get_scout_results first when the user only wants the current list.
- Dossiers (research_dossier, get_dossier): live public-source research on one project. Morgan Hall North is "demo-project"; other projects use their scout id. A live dossier takes 1-3 minutes.
- Stakeholders and outreach (list_stakeholders, draft_outreach, send_outreach, list_outreach): emails linking each stakeholder's proposal page. Draft first and show the user the subject and body. Call send_outreach only after the user explicitly asks to send that email. During the hackathon every email is delivered to the team's own inbox, never to the stakeholder; say so when you send.
Only state facts the tools returned. Mention sources by publisher when you give facts.`;

export type PipelineToolOptions = {
  /**
   * Progress lines from long tools, for a "working" feed in the chat. `toolUseId` is the call they belong to, so two
   * calls of the same tool in one reply keep their lines apart.
   */
  onProgress?: (progress: Progress & { tool: string; toolUseId?: string }) => void;
};

function json(value: unknown): string {
  return JSON.stringify(value);
}

function deadline(signal: AbortSignal | null | undefined, ms: number): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
}

function errorText(error: unknown): string {
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}

function scoutSummary(result: ScoutResult, source: string) {
  return {
    source,
    runAt: result.runAt,
    regions: result.regions,
    count: result.candidates.length,
    candidates: result.candidates.slice(0, 12).map((c) => ({
      id: c.id,
      name: c.name,
      city: `${c.city}, ${c.state}`,
      stage: c.stage,
      completion: c.completion,
      type: c.buildingType,
      whyItFits: c.whyItFits,
      score: c.score,
      firms: c.firms.map((f) => `${f.name} (${f.role})`),
    })),
  };
}

function dossierSummary(dossier: Dossier, source: string) {
  const publisher = new Map(dossier.sources.map((s) => [s.id, s.publisher]));
  const cite = (ids: string[]) => [...new Set(ids.map((id) => publisher.get(id)).filter(Boolean))];
  return {
    source,
    projectId: dossier.projectId,
    project: dossier.projectName,
    summary: dossier.summary.text,
    keyFacts: dossier.keyFacts.map((f) => `${f.label}: ${f.value}`),
    firms: dossier.firms.map((f) => ({ name: f.name, role: f.role, scope: f.scope, website: f.website, sources: cite(f.sourceIds) })),
    missingRoles: dossier.missingRoles,
    timeline: dossier.timeline.map((t) => `${t.when}: ${t.what}`),
    sourceCount: dossier.sources.length,
  };
}

function messageSummary(message: OutreachMessage) {
  return {
    clientId: message.clientId,
    for: `${message.intendedFor.name}, ${message.intendedFor.company}`,
    status: message.status,
    subject: message.subject,
    body: message.body,
    proposalUrl: message.proposalUrl,
    deliveredTo: message.deliveredTo,
    sentAt: message.sentAt,
    error: message.error,
    replies: message.replies.map((r) => ({ from: r.from, at: r.receivedAt, snippet: r.snippet })),
  };
}

export function createPipelineTools(options: PipelineToolOptions = {}): BetaRunnableTool[] {
  const progressFor = (tool: string, context?: BetaToolRunContext) => (p: Progress) =>
    options.onProgress?.({ ...p, tool, toolUseId: context?.toolUse.id });

  return [
    betaZodTool({
      name: "scout_projects",
      description:
        "Searches the web live for notable construction projects (under construction, topped out, or finished since about 2024) in Tradesmark's Northeast regions, ranks them for fit, and stores the list for the Discover screen. Takes 1-2 minutes. Omit regions to scout all five.",
      inputSchema: z.object({ regions: z.array(z.enum(regionIds)).min(1).optional() }),
      run: async ({ regions }, context) => {
        const release = claimRun("scout");
        if (!release) return "Error: a scout run is already in progress. Try get_scout_results in a minute.";
        try {
          const result = await runScout({
            regions: regions ?? [...regionIds],
            signal: deadline(context?.signal, SCOUT_DEADLINE_MS),
            progress: progressFor("scout_projects", context),
          });
          await writeRecord("scout", "latest", result);
          return json(scoutSummary(result, "live"));
        } catch (error) {
          return errorText(error);
        } finally {
          release();
        }
      },
    }),

    betaZodTool({
      name: "get_scout_results",
      description: "Returns the latest scouted projects (from the last live run, or the saved snapshot) without searching again.",
      inputSchema: z.object({}),
      run: async () => {
        const latest = await loadScoutResult();
        return latest ? json(scoutSummary(latest.data, latest.source)) : "No scout results yet. Run scout_projects.";
      },
    }),

    betaZodTool({
      name: "research_dossier",
      description:
        "Researches one project live from public sources: building facts, firms by role with their websites, timeline, and sources. Use projectId \"demo-project\" for Morgan Hall North, or a scouted project's id. Takes 1-3 minutes and stores the dossier for the Dossier screen.",
      inputSchema: z.object({ projectId: z.string().regex(/^[a-z0-9-]+$/) }),
      run: async ({ projectId }, context) => {
        const target = await resolveTarget(projectId);
        if (!target) return `Error: no project "${projectId}". Use "demo-project" or an id from get_scout_results.`;
        const release = claimRun(`dossier:${projectId}`);
        if (!release) return `Error: a dossier for ${projectId} is already being researched. Try get_dossier in a minute.`;
        try {
          const dossier = await runDossier(target, {
            signal: deadline(context?.signal, DOSSIER_DEADLINE_MS),
            progress: progressFor("research_dossier", context),
          });
          await writeRecord("dossiers", projectId, dossier);
          return json(dossierSummary(dossier, "live"));
        } catch (error) {
          return errorText(error);
        } finally {
          release();
        }
      },
    }),

    betaZodTool({
      name: "get_dossier",
      description: "Returns the latest stored dossier for a project without researching again.",
      inputSchema: z.object({ projectId: z.string().regex(/^[a-z0-9-]+$/) }),
      run: async ({ projectId }) => {
        const latest = await loadDossier(projectId);
        return latest ? json(dossierSummary(latest.data, latest.source)) : `No dossier for ${projectId} yet. Run research_dossier.`;
      },
    }),

    betaZodTool({
      name: "list_stakeholders",
      description:
        "Lists the stakeholders on the demo project (Morgan Hall North) who have a proposal page: client id, company, role, contact, and what they need.",
      inputSchema: z.object({}),
      run: async () => {
        const clients = await loadClients();
        return json(
          clients.map((c) => ({
            clientId: c.id,
            company: c.company,
            role: c.role,
            contact: `${c.contact.name}, ${c.contact.title}`,
            need: c.need,
            focus: c.focusElements,
          })),
        );
      },
    }),

    betaZodTool({
      name: "draft_outreach",
      description:
        "Drafts (or re-drafts) the outreach email for one stakeholder, linking their proposal page. Returns the subject and body to show the user. Does not send anything.",
      inputSchema: z.object({ clientId: z.string().regex(/^[a-z0-9-]+$/), force: z.boolean().optional() }),
      run: async ({ clientId, force }) => {
        try {
          const result = await draftOutreach(clientId, { force });
          if (result.status === "unknown-client") return `Error: no stakeholder "${clientId}". Use list_stakeholders.`;
          if (result.status === "already-sent") {
            return json({ note: "Already sent. Pass force to re-draft.", ...messageSummary(result.message) });
          }
          return json({ draftedBy: result.source === "live" ? "model" : "template", ...messageSummary(result.message) });
        } catch (error) {
          return errorText(error);
        }
      },
    }),

    betaZodTool({
      name: "send_outreach",
      description:
        "Sends a stakeholder's drafted outreach email through Gmail. Only call this after the user has explicitly asked to send this email in this conversation, and set confirmed to true. During the hackathon it is delivered to the team's own inbox, never to the stakeholder.",
      inputSchema: z.object({
        clientId: z.string().regex(/^[a-z0-9-]+$/),
        confirmed: z.boolean(),
        resend: z.boolean().optional(),
      }),
      run: async ({ clientId, confirmed, resend }) => {
        if (confirmed !== true) return "Error: not sent. Ask the user to confirm sending this email first.";
        try {
          const result = await sendOutreach(clientId, { resend });
          switch (result.status) {
            case "no-draft":
              return `Error: no draft for ${clientId}. Call draft_outreach first.`;
            case "not-configured":
              return `Error: Gmail is not set up (${result.reason}).`;
            case "already-sent":
              return json({ note: "Already sent. Pass resend to send again.", ...messageSummary(result.message) });
            default:
              return json(messageSummary(result.message));
          }
        } catch (error) {
          return errorText(error);
        }
      },
    }),

    betaZodTool({
      name: "list_outreach",
      description: "Lists outreach emails with their status, where they were delivered, and any replies (synced from Gmail).",
      inputSchema: z.object({}),
      run: async () => {
        try {
          const overview = await getOutreachOverview();
          return json({
            gmail: overview.gmail,
            syncedAt: overview.syncedAt,
            messages: overview.messages.map(messageSummary),
          });
        } catch (error) {
          return errorText(error);
        }
      },
    }),
  ];
}
