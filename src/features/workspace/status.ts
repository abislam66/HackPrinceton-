import "server-only";
import { loadClient, loadClients } from "@/features/project/load";
import type { Client } from "@/features/project/schema";
import type { Proposal } from "@/features/proposal/schema";
import { getProposal } from "@/features/proposal/store";
import { listEvents, type StoredEvent } from "@/features/tracking/record";
import { EMPTY_SUMMARY, summarizeEvents, type ClientSummary } from "@/features/tracking/summary";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSentAt, isBuilt } from "./state";

/** not-built: nothing generated in this demo run. ready: a proposal to review. sent: delivered. */
export type Stage = "not-built" | "ready" | "sent";

export type StakeholderStatus = {
  client: Client;
  proposal: Proposal | null;
  stage: Stage;
  sentAt: string | null;
  engagement: ClientSummary;
  /** This client's events, newest first, at most 50. */
  events: StoredEvent[];
};

const EVENTS_PER_CLIENT = 50;

function stageOf(clientId: string, proposal: Proposal | null): Stage {
  if (proposal?.status === "sent") return "sent";
  if (proposal && (isBuilt(clientId) || isSupabaseConfigured())) return "ready";
  return "not-built";
}

async function statusFor(client: Client): Promise<StakeholderStatus> {
  const [proposal, events] = await Promise.all([
    getProposal(client.id),
    listEvents(EVENTS_PER_CLIENT, { clientId: client.id }),
  ]);
  return {
    client,
    proposal,
    stage: stageOf(client.id, proposal),
    sentAt: getSentAt(client.id),
    engagement: summarizeEvents(events)[client.id] ?? { ...EMPTY_SUMMARY },
    events,
  };
}

/** Every stakeholder of the demo project with its proposal, stage and engagement. */
export async function loadStakeholders(): Promise<StakeholderStatus[]> {
  const clients = await loadClients();
  return Promise.all(clients.map(statusFor));
}

/** One stakeholder, or null for an unknown client id. */
export async function loadStakeholder(clientId: string): Promise<StakeholderStatus | null> {
  const client = await loadClient(clientId);
  return client ? statusFor(client) : null;
}
