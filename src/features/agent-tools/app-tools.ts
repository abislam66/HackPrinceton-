import "server-only";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { after } from "next/server";
import { z } from "zod";
import { generateViewer } from "@/features/building-viewer/generate";
import { takeGeneration } from "@/features/building-viewer/guard";
import { loadDossier } from "@/features/dossier/load";
import { editOutreachDraft } from "@/features/outreach/actions";
import { listProjects } from "@/features/project-agent/store";
import { PROJECT_SLUG } from "@/features/project/schema";
import { generateProposal } from "@/features/proposal/generate";
import { canTransition } from "@/features/proposal/status";
import { getProposal, saveProposal } from "@/features/proposal/store";
import type { Proposal } from "@/features/proposal/schema";
import { loadProjectModel, saveProjectModel, viewerInputFor } from "@/features/scout/model";
import { addScoutedProject, getScoutedProject, listScoutedProjects } from "@/features/scout/projects";
import { markBuilt, markSent } from "@/features/workspace/state";
import { loadStakeholder, loadStakeholders, type StakeholderStatus } from "@/features/workspace/status";
import { claimRun, isRunning } from "@/lib/agent/run";

/*
 * The rest of the internal app as tools for the Agent tab, next to the live pipeline tools (./tools.ts): the
 * Projects list, adding a scouted building as a project, its 3D model, building and reviewing proposals, tracking,
 * and editing an outreach draft by hand. Each tool calls the same functions as the screens, so whatever the agent
 * does shows up there.
 *
 * Stakeholder tools default to the demo project. Scouted projects get stakeholder tools later.
 */

const SLUG = z.string().regex(/^[a-z0-9-]+$/);
const PROJECT_ID = SLUG.optional().describe(`The project id; defaults to "${PROJECT_SLUG}" (Morgan Hall North)`);
/** The viewer generator's limit is per caller; every chat shares this one. */
const AGENT_RATE_KEY = "agent-chat";

export const APP_TOOLS_PROMPT = `You can also run the rest of the internal app:
- Projects (list_projects, add_project_from_scout): the Projects list holds Morgan Hall North ("${PROJECT_SLUG}"), projects opened from drafts, and buildings added from scouting. add_project_from_scout takes a candidate id from get_scout_results.
- 3D models (generate_project_model, get_project_model): a scouted project's model is generated from its address, scout facts and dossier. It runs in the background for up to 5 minutes; tell the user where it will appear and check back with get_project_model. Morgan Hall North's model comes from the model builder and is not generated here. Running research_dossier first gives the model more to go on.
- Proposals (get_stakeholder_status, generate_proposal, review_proposal): generate_proposal builds one stakeholder's shots and pitch live (about 25 seconds) and saves them as a draft. review_proposal approves it, marks it sent, or reopens it as a draft. Marking a proposal sent does not email anyone; emails go through outreach.
- Tracking (get_stakeholder_status): opens, watch time and clicks on each proposal page, which ones look like high intent, and the latest events. These are real events from the proposal pages.
- Outreach edits (edit_outreach_draft): changes the subject or body of a draft in the user's words without re-drafting. Show the result.
Link pages as plain paths: /projects, /projects/<id> (a scouted project's page opens on its 3D model), /projects/<id>/dossier, /projects/<id>/stakeholders/<clientId>, /proposals/<clientId>.`;

function json(value: unknown): string {
  return JSON.stringify(value);
}

function errorText(error: unknown): string {
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}

function proposalSummary(proposal: Proposal | null) {
  if (!proposal) return null;
  return {
    status: proposal.status,
    headline: proposal.pitch.headline,
    teaser: proposal.pitch.teaserLine,
    shots: proposal.shots.map((s) => `${s.name} (${s.side})`),
  };
}

function stakeholderSummary(s: StakeholderStatus, eventLimit: number) {
  return {
    clientId: s.client.id,
    company: s.client.company,
    role: s.client.role,
    stage: s.stage,
    sentAt: s.sentAt,
    proposal: proposalSummary(s.proposal),
    engagement: s.engagement,
    recentEvents: s.events.slice(0, eventLimit).map((e) => ({ type: e.type, at: e.createdAt, ...e.payload })),
    page: `/projects/${s.projectSlug}/stakeholders/${s.client.id}`,
    proposalPage: `/proposals/${s.client.id}`,
  };
}

/** Keeps the serverless function alive for a run that outlives the chat reply. Falls back to plain fire-and-forget. */
function keepAlive(work: Promise<unknown>): void {
  try {
    after(() => work);
  } catch {
    // Outside a request (tests): the promise still runs.
  }
}

export function createAppTools(): BetaRunnableTool[] {
  return [
    betaZodTool({
      name: "list_projects",
      description:
        "Lists every project on the Projects page: Morgan Hall North, projects opened from drafts, and buildings added from scouting, with whether each scouted one has a dossier and a 3D model.",
      inputSchema: z.object({}),
      run: async () => {
        try {
          const [projects, scouted] = await Promise.all([listProjects(), listScoutedProjects()]);
          const scoutedRows = await Promise.all(
            scouted.map(async (p) => {
              const [dossier, model] = await Promise.all([loadDossier(p.id), loadProjectModel(p.id)]);
              return {
                id: p.id,
                name: p.candidate.name,
                kind: "scouted",
                city: `${p.candidate.city}, ${p.candidate.state}`,
                stage: p.candidate.stage,
                addedAt: p.addedAt,
                hasDossier: Boolean(dossier),
                model: model ? `ready (${model.generatedAt})` : isRunning(`model:${p.id}`) ? "generating" : "none",
                page: `/projects/${p.id}`,
              };
            }),
          );
          return json([
            ...projects.map((p) => ({
              id: p.id,
              name: p.name,
              kind: p.id === PROJECT_SLUG ? "demo" : "opened from a draft",
              basedOn: p.basedOn,
              page: `/projects/${p.id}`,
            })),
            ...scoutedRows,
          ]);
        } catch (error) {
          return errorText(error);
        }
      },
    }),

    betaZodTool({
      name: "add_project_from_scout",
      description:
        "Adds a scouted building to the Projects list, so it gets its own project page, dossier and 3D model. Takes a candidate id from get_scout_results. Adding one twice is harmless.",
      inputSchema: z.object({ candidateId: SLUG }),
      run: async ({ candidateId }) => {
        try {
          const outcome = await addScoutedProject(candidateId);
          if (outcome.status === "reserved") return `Error: "${candidateId}" is the demo project, which is already a project.`;
          if (outcome.status === "unknown-candidate") {
            return `Error: no scouted candidate "${candidateId}". Use an id from get_scout_results.`;
          }
          return json({
            status: outcome.status === "added" ? "added" : "already a project",
            id: outcome.project.id,
            name: outcome.project.candidate.name,
            page: `/projects/${outcome.project.id}`,
          });
        } catch (error) {
          return errorText(error);
        }
      },
    }),

    betaZodTool({
      name: "generate_project_model",
      description:
        "Starts generating the 3D model (a building viewer) for a project added from scouting, from its address, scout facts and dossier. Runs in the background for up to 5 minutes and stores the model on the project. Generating again replaces it.",
      inputSchema: z.object({ projectId: SLUG }),
      run: async ({ projectId }) => {
        if (projectId === PROJECT_SLUG) {
          return json({ note: "Morgan Hall North's model comes from the model builder and is already in the app.", page: `/projects/${PROJECT_SLUG}` });
        }
        const project = await getScoutedProject(projectId);
        if (!project) return `Error: "${projectId}" is not a project added from scouting. Use list_projects, or add_project_from_scout first.`;
        const limit = await takeGeneration(AGENT_RATE_KEY);
        if (!limit.ok) return `Error: 5 models were generated in the last hour. Try again in ${Math.ceil(limit.retryAfterS / 60)} minutes.`;
        const release = claimRun(`model:${projectId}`);
        if (!release) return `A model for ${projectId} is already being generated. Check get_project_model in a few minutes.`;

        const dossier = await loadDossier(projectId);
        const input = viewerInputFor(project, dossier?.data ?? null);
        // The run outlives this reply, so its steps are not streamed to the chat.
        const work = generateViewer(input, null, () => {})
          .then((result) =>
            saveProjectModel({
              projectId,
              html: result.html,
              reply: result.reply,
              geocodeStatus: result.geocode_status,
              contextStatus: result.context_status,
              drift: result.drift,
              generatedAt: new Date().toISOString(),
            }),
          )
          .catch((error) => console.error(`agent model ${projectId} failed: ${(error as Error).message}`))
          .finally(release);
        keepAlive(work);

        return json({
          status: "started",
          projectId,
          usedDossier: Boolean(dossier),
          takes: "up to 5 minutes",
          page: `/projects/${projectId}`,
        });
      },
    }),

    betaZodTool({
      name: "get_project_model",
      description: "Says whether a scouted project's 3D model is ready, still generating, or missing, with what the generator said about the building.",
      inputSchema: z.object({ projectId: SLUG }),
      run: async ({ projectId }) => {
        if (isRunning(`model:${projectId}`)) return json({ projectId, status: "generating" });
        const model = await loadProjectModel(projectId);
        if (!model) return json({ projectId, status: "none" });
        return json({
          projectId,
          status: "ready",
          generatedAt: model.generatedAt,
          notes: model.reply,
          geocode: model.geocodeStatus,
          nearbyBuildings: model.contextStatus,
          page: `/projects/${projectId}`,
        });
      },
    }),

    betaZodTool({
      name: "get_stakeholder_status",
      description:
        "Each stakeholder's proposal stage (not-built, ready, sent), proposal headline and shots, and tracking on their proposal page: opens, watch seconds, clicks, last activity, high intent, and recent events. Pass clientId for one stakeholder with more events.",
      inputSchema: z.object({ projectId: PROJECT_ID, clientId: SLUG.optional() }),
      run: async ({ projectId = PROJECT_SLUG, clientId }) => {
        try {
          if (clientId) {
            const one = await loadStakeholder(projectId, clientId);
            return one ? json(stakeholderSummary(one, 20)) : `Error: no stakeholder "${clientId}" on ${projectId}. Use list_stakeholders.`;
          }
          const all = await loadStakeholders(projectId);
          if (all.length === 0) return `No stakeholders on ${projectId}.`;
          return json(all.map((s) => stakeholderSummary(s, 3)));
        } catch (error) {
          return errorText(error);
        }
      },
    }),

    betaZodTool({
      name: "generate_proposal",
      description:
        "Builds one stakeholder's proposal live (shots, then pitch) from their current brief and saves it as a draft for review. About 25 seconds. If generation fails, the last good proposal is kept.",
      inputSchema: z.object({ clientId: SLUG, projectId: PROJECT_ID }),
      run: async ({ clientId, projectId = PROJECT_SLUG }) => {
        try {
          const result = await generateProposal(clientId, projectId);
          if (result.status === "unknown-client") return `Error: no stakeholder "${clientId}" on ${projectId}. Use list_stakeholders.`;
          markBuilt(clientId);
          return json({
            clientId,
            builtBy: result.source === "live" ? "generated now" : "kept the last good proposal (generation failed or ran long)",
            ...proposalSummary(result.proposal),
            page: `/projects/${projectId}/stakeholders/${clientId}`,
            proposalPage: `/proposals/${clientId}?preview=1`,
          });
        } catch (error) {
          return errorText(error);
        }
      },
    }),

    betaZodTool({
      name: "review_proposal",
      description:
        'Moves a stakeholder\'s proposal through review: "approve" (draft to approved), "mark_sent" (to sent, approving first if needed), or "reopen" (back to draft). Does not email anyone.',
      inputSchema: z.object({
        clientId: SLUG,
        action: z.enum(["approve", "mark_sent", "reopen"]),
        projectId: PROJECT_ID,
      }),
      run: async ({ clientId, action, projectId = PROJECT_SLUG }) => {
        try {
          let proposal = await getProposal(clientId, projectId);
          if (!proposal) return `Error: no proposal for ${clientId} yet. Call generate_proposal first.`;
          const steps = action === "approve" ? (["approved"] as const) : action === "reopen" ? (["draft"] as const) : (["approved", "sent"] as const);
          for (const next of steps) {
            if (proposal.status === next) continue;
            if (!canTransition(proposal.status, next)) return `Error: a ${proposal.status} proposal cannot move to ${next}.`;
            proposal = { ...proposal, status: next };
            if ((await saveProposal(proposal)) === "none") return "Error: nothing can be written here (no Supabase).";
          }
          markBuilt(clientId);
          if (proposal.status === "sent") markSent(clientId, new Date().toISOString());
          return json({ clientId, status: proposal.status, page: `/projects/${projectId}/stakeholders/${clientId}` });
        } catch (error) {
          return errorText(error);
        }
      },
    }),

    betaZodTool({
      name: "edit_outreach_draft",
      description:
        "Rewrites a stakeholder's outreach draft subject and/or body directly, with no model. The proposal link is kept in the body. Returns the saved email and any house-rule problems (pricing, scope, length). Does not send.",
      inputSchema: z
        .object({ clientId: SLUG, subject: z.string().max(200).optional(), body: z.string().max(4000).optional() })
        .refine((v) => v.subject || v.body, "Give a new subject, body, or both"),
      run: async ({ clientId, subject, body }) => {
        try {
          const result = await editOutreachDraft(clientId, { subject, body });
          if (result.status === "no-draft") return `Error: no draft for ${clientId}. Call draft_outreach first.`;
          if (result.status === "already-sent") return `Error: ${clientId}'s email was already sent. Re-draft it with draft_outreach and force first.`;
          return json({
            clientId,
            subject: result.message.subject,
            body: result.message.body,
            status: result.message.status,
            problems: result.problems,
          });
        } catch (error) {
          return errorText(error);
        }
      },
    }),
  ];
}
