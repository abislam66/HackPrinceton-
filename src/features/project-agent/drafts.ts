import "server-only";
import { randomUUID } from "node:crypto";
import { PROJECT_SLUG, type Client } from "@/features/project/schema";
import { planNewStakeholder, planScenario } from "@/features/proposal/scenario";
import { getProposal, saveProposal } from "@/features/proposal/store";
import { loadStakeholderModel } from "@/features/workspace/model";
import {
  getDraft,
  listProjects,
  loadProjectClient,
  loadProjectClients,
  loadProjectFacts,
  saveDraft,
  saveProjectClient,
  saveProjectRecord,
  type ProjectDraft,
} from "./store";

/*
 * Drafting and resolving project changes. A draft holds the changed brief and a regenerated
 * proposal; nothing a stakeholder or a page sees changes until the user resolves it:
 * - replace:     this project's stakeholder becomes the drafted one, and its proposal is replaced.
 * - new-project: this project stays as it is; a new project opens with the change applied.
 * - discard:     nothing changes.
 */

export class DraftError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

export type DraftRequest = {
  projectSlug: string;
  /** The change, in the team's words. */
  change: string;
  /** The stakeholder it changes; omit to add a new stakeholder. */
  clientId?: string;
};

/** Drafts a change: reads it, updates or creates the brief, regenerates the proposal. Saves only the draft. */
export async function createDraft({ projectSlug, change, clientId }: DraftRequest): Promise<ProjectDraft> {
  const project = await loadProjectFacts(projectSlug);
  if (!project) throw new DraftError(`Unknown project: ${projectSlug}`, 404);

  let kind: ProjectDraft["kind"];
  let result;
  if (clientId) {
    const client = await loadProjectClient(projectSlug, clientId);
    if (!client) throw new DraftError(`Unknown stakeholder ${clientId} on ${projectSlug}`, 404);
    const model = await loadStakeholderModel(clientId);
    kind = "update";
    result = await planScenario({ project, client, model, change });
  } else {
    const newId = `stakeholder-${shortId()}`;
    const model = await loadStakeholderModel(newId);
    kind = "new-stakeholder";
    result = await planNewStakeholder({ project, clientId: newId, model, description: change });
  }

  const draft: ProjectDraft = {
    id: `draft-${shortId()}`,
    projectSlug,
    createdAt: new Date().toISOString(),
    request: change,
    kind,
    clientId: result.client.id,
    client: result.client,
    scenario: result.scenario,
    proposal: result.proposal,
    status: "pending",
  };
  await saveDraft(draft);
  return draft;
}

export type DraftAction = "replace" | "new-project" | "discard";

/** Applies the user's choice to a pending draft and returns the updated draft. */
export async function resolveDraft(projectSlug: string, draftId: string, action: DraftAction): Promise<ProjectDraft> {
  const draft = await getDraft(projectSlug, draftId);
  if (!draft) throw new DraftError(`Unknown draft: ${draftId}`, 404);
  if (draft.status !== "pending") throw new DraftError(`Draft ${draftId} is already ${draft.status}`, 409);
  const resolvedAt = new Date().toISOString();

  if (action === "discard") {
    const done = { ...draft, status: "discarded" as const, resolvedAt };
    await saveDraft(done);
    return done;
  }

  if (action === "replace") {
    await saveProjectClient(projectSlug, draft.client);
    await saveProposal({ ...draft.proposal, clientId: draft.clientId, projectSlug, status: "draft" });
    const done = { ...draft, status: "replaced" as const, resolvedAt };
    await saveDraft(done);
    return done;
  }

  // New project: every current stakeholder, with the drafted change applied, under new ids.
  const facts = await loadProjectFacts(projectSlug);
  const current = await loadProjectClients(projectSlug);
  if (!facts || !current) throw new DraftError(`Unknown project: ${projectSlug}`, 404);
  const newSlug = await nextProjectSlug();
  const suffix = newSlug.slice(PROJECT_SLUG.length + 1);
  const withChange: Client[] =
    draft.kind === "update" ? current.map((c) => (c.id === draft.clientId ? draft.client : c)) : [...current, draft.client];

  for (const client of withChange) {
    const id = `${client.id.replace(/-p\d+$/, "")}-p${suffix}`;
    await saveProjectClient(newSlug, { ...client, id });
    const proposal =
      client.id === draft.clientId ? draft.proposal : await getProposal(client.id, projectSlug);
    if (proposal) await saveProposal({ ...proposal, clientId: id, projectSlug: newSlug, status: "draft" });
  }
  await saveProjectRecord({
    id: newSlug,
    basedOn: projectSlug,
    name: `${facts.name} · ${shortLabel(draft)}`,
    createdAt: resolvedAt,
    request: draft.request,
    fromDraft: draft.id,
  });
  const done = { ...draft, status: "new-project" as const, resolvedAt, newProjectId: newSlug };
  await saveDraft(done);
  return done;
}

async function nextProjectSlug(): Promise<string> {
  const taken = new Set((await listProjects()).map((p) => p.id));
  for (let n = 2; ; n++) {
    const slug = `${PROJECT_SLUG}-${n}`;
    if (!taken.has(slug)) return slug;
  }
}

/** "Temple University for investor and owner updates": who changed, and their need now. */
function shortLabel(draft: ProjectDraft): string {
  const label = `${draft.client.company} for ${draft.client.need.replaceAll("-", " ")}`;
  return label.length > 70 ? `${label.slice(0, 69).trimEnd()}…` : label;
}

function shortId(): string {
  return randomUUID().replaceAll("-", "").slice(0, 10);
}
