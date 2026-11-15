import "server-only";
import { loadClient } from "@/features/project/load";
import { PROJECT_SLUG, type Client } from "@/features/project/schema";
import { listProjects, loadProjectClient, loadProjectClients } from "@/features/project-agent/store";
import type { Proposal } from "@/features/proposal/schema";
import { getProposal } from "@/features/proposal/store";
import { listEvents, type StoredEvent } from "@/features/tracking/record";
import { EMPTY_SUMMARY, summarizeEvents, type ClientSummary } from "@/features/tracking/summary";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSentAt, isBuilt } from "./state";

/** not-built: nothing generated in this demo run. ready: a proposal to review. sent: delivered. */
export type Stage = "not-built" | "ready" | "sent";

export type StakeholderStatus = {
  projectSlug: string;
  client: Client;
  proposal: Proposal | null;
  stage: Stage;
  /**
   * The project agent wrote this brief: a stakeholder it replaced or added, or any stakeholder of a project it
   * opened. Its proposal was generated with the draft, so it counts as built.
   */
  changedByAgent: boolean;
  sentAt: string | null;
  engagement: ClientSummary;
  /** This client's events, newest first, at most 50. */
  events: StoredEvent[];
};

const EVENTS_PER_CLIENT = 50;

function stageOf(clientId: string, proposal: Proposal | null, changedByAgent: boolean): Stage {
  if (proposal?.status === "sent") return "sent";
  if (proposal && (changedByAgent || isBuilt(clientId) || isSupabaseConfigured())) return "ready";
  return "not-built";
}

/** True unless the brief is the pre-loaded one in data/, unchanged. */
async function isChangedByAgent(projectSlug: string, client: Client): Promise<boolean> {
  if (projectSlug !== PROJECT_SLUG) return true;
  const base = await loadClient(client.id);
  // Both sides went through clientSchema, so their keys come out in the same order.
  return !base || JSON.stringify(base) !== JSON.stringify(client);
}

async function statusFor(projectSlug: string, client: Client): Promise<StakeholderStatus> {
  const [proposal, events, changedByAgent] = await Promise.all([
    getProposal(client.id, projectSlug),
    listEvents(EVENTS_PER_CLIENT, { clientId: client.id }),
    isChangedByAgent(projectSlug, client),
  ]);
  return {
    projectSlug,
    client,
    proposal,
    stage: stageOf(client.id, proposal, changedByAgent),
    changedByAgent,
    sentAt: getSentAt(client.id),
    engagement: summarizeEvents(events)[client.id] ?? { ...EMPTY_SUMMARY },
    events,
  };
}

/** Every stakeholder of a project with its proposal, stage and engagement. Empty for an unknown project. */
export async function loadStakeholders(projectSlug: string): Promise<StakeholderStatus[]> {
  const clients = (await loadProjectClients(projectSlug)) ?? [];
  return Promise.all(clients.map((client) => statusFor(projectSlug, client)));
}

/** One stakeholder of a project, or null for an unknown project or client id. */
export async function loadStakeholder(projectSlug: string, clientId: string): Promise<StakeholderStatus | null> {
  const client = await loadProjectClient(projectSlug, clientId);
  return client ? statusFor(projectSlug, client) : null;
}

/**
 * The project a stakeholder id belongs to, for pages whose URL carries only the client (the proposal page).
 * Stakeholder ids are unique across projects: a project opened from a draft gives its copies new ids.
 */
export async function findStakeholder(clientId: string): Promise<{ projectSlug: string; client: Client } | null> {
  for (const project of await listProjects()) {
    const client = await loadProjectClient(project.id, clientId);
    if (client) return { projectSlug: project.id, client };
  }
  return null;
}
