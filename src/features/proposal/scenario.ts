import "server-only";
import { z } from "zod";
import { generatePitch } from "@/features/pitch/generate";
import { loadClient, loadProject } from "@/features/project/load";
import { needCategories, stakeholderRoles, type Client, type Project } from "@/features/project/schema";
import { generateShots } from "@/features/shots/generate";
import { loadStakeholderModel } from "@/features/workspace/model";
import { callStructured } from "./llm";
import type { Proposal } from "./schema";
import { saveProposal } from "./store";

/*
 * Scenario re-pitch: the team describes a change in a stakeholder or in the project's goals, in
 * plain words. The model turns it into an updated brief for that client (and, if the change is
 * about the project, a short stated update), then shots and pitch are regenerated from it and
 * saved as a draft for review. Pre-loaded data in data/ is never changed.
 */

/** How long the whole re-pitch may take: read the change, then shots, then pitch. */
const SCENARIO_BUDGET_MS = 40_000;
export const MAX_CHANGE_CHARS = 1000;

/** The updated brief the model derives from the described change. */
export const scenarioSchema = z.object({
  /** One line on what changed, for the reviewer. */
  summary: z.string().min(1),
  role: z.enum(stakeholderRoles),
  need: z.enum(needCategories),
  needsNotes: z.string().min(1),
  /** Parts of the building this client now cares about. Only parts named in the project facts. */
  focusElements: z.array(z.string().min(1)).min(1).max(4),
  /** The change to the project's goals or projections as the team stated it, or "" if none. */
  projectUpdate: z.string(),
});
export type Scenario = z.infer<typeof scenarioSchema>;

export type ScenarioResult = { scenario: Scenario; client: Client; proposal: Proposal };

const SYSTEM = `You update a client brief for Tradesmark's proposal system. Tradesmark films and documents construction projects. The team describes a change: in what this client needs, in who the client is, or in the project's goals or projections. Return the client's updated brief.

Rules:
- Change only what the described change implies; keep everything else from the current brief.
- need must be one of the allowed categories; pick the one that fits the new situation.
- focusElements: 1 to 4 parts of the building, named the way the project facts name them. Never invent building parts.
- needsNotes: two or three plain sentences on the client's new situation and what footage helps them.
- projectUpdate: if the change is about the project itself (goals, schedule, use, scope), restate it in one sentence as the team said it, without adding detail. Otherwise "".
- summary: one line, e.g. "Need moves from sales-and-bids to recruiting: footage for hiring glaziers."`;

/** Unknown client → null. Otherwise regenerates and saves the draft, or throws. */
export async function applyScenario(clientId: string, change: string): Promise<ScenarioResult | null> {
  const client = await loadClient(clientId);
  if (!client) return null;
  const [project, model] = await Promise.all([loadProject(), loadStakeholderModel(clientId)]);

  const run = (async () => {
    const scenario = await callStructured(
      scenarioSchema,
      SYSTEM,
      JSON.stringify({ project, currentBrief: briefOf(client), allowedNeeds: needCategories, change }, null, 2),
      { effort: "low", maxTokens: 4000 },
    );
    const updated: Client = {
      ...client,
      role: scenario.role,
      need: scenario.need,
      needsNotes: scenario.needsNotes,
      focusElements: scenario.focusElements,
    };
    const scenarioProject = withUpdate(project, scenario.projectUpdate);
    const shots = await generateShots({ project: scenarioProject, client: updated, model });
    const pitch = await generatePitch({ project: scenarioProject, client: updated, shots });
    const proposal: Proposal = { clientId, projectSlug: project.slug, status: "draft", pitch, shots };
    await saveProposal(proposal);
    return { scenario, client: updated, proposal };
  })();

  return withTimeout(run, SCENARIO_BUDGET_MS);
}

function briefOf(client: Client) {
  const { company, role, need, needsNotes, focusElements } = client;
  return { company, role, need, needsNotes, focusElements };
}

/** The project as the team now describes it: the stated update is appended, marked as theirs. */
function withUpdate(project: Project, update: string): Project {
  const text = update.trim();
  return text ? { ...project, summary: `${project.summary} Update from the team: ${text}` } : project;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`The re-pitch took longer than ${ms / 1000} s`)), ms);
  });
  promise.catch(() => {});
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
