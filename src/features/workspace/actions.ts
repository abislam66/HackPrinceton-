"use server";

import { revalidatePath } from "next/cache";
import { listProjects, loadProjectClient, loadProjectClients } from "@/features/project-agent/store";
import { canTransition } from "@/features/proposal/status";
import { getProposal, saveProposal } from "@/features/proposal/store";
import type { Proposal } from "@/features/proposal/schema";
import { clearEventMemory } from "@/features/tracking/record";
import { clearWorkspaceMemory, markBuilt, markSent } from "./state";

export type ActionResult = { ok: true } | { ok: false; error: string };

function refresh(): void {
  revalidatePath("/", "layout");
}

function fail(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

async function requireClient(projectSlug: unknown, clientId: unknown): Promise<string | null> {
  if (typeof projectSlug !== "string" || typeof clientId !== "string") return null;
  return (await loadProjectClient(projectSlug, clientId)) ? clientId : null;
}

/** Marks a stakeholder as built in this demo run, so its stored proposal shows as ready. */
export async function markBuiltAction(projectSlug: string, clientId: string): Promise<ActionResult> {
  const id = await requireClient(projectSlug, clientId);
  if (!id) return { ok: false, error: "Unknown stakeholder." };
  markBuilt(id);
  refresh();
  return { ok: true };
}

/** Moves the stored proposal draft → approved → sent, then records the send time. */
export async function sendProposal(projectSlug: string, clientId: string): Promise<ActionResult> {
  const id = await requireClient(projectSlug, clientId);
  if (!id) return { ok: false, error: "Unknown stakeholder." };
  try {
    let proposal: Proposal | null = await getProposal(id, projectSlug);
    if (!proposal) return { ok: false, error: "Build the proposal before sending it." };
    if (proposal.status === "sent") return { ok: false, error: "This proposal was already sent." };
    for (const next of ["approved", "sent"] as const) {
      if (proposal.status === next) continue;
      if (!canTransition(proposal.status, next)) {
        return { ok: false, error: `Cannot move a ${proposal.status} proposal to ${next}.` };
      }
      proposal = { ...proposal, status: next };
      if ((await saveProposal(proposal)) === "none") return { ok: false, error: "Could not save the proposal." };
    }
    markBuilt(id);
    markSent(id, new Date().toISOString());
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/** Puts the demo back at the start: forgets built/sent state and events, and resets every project's proposals to draft. */
export async function resetDemo(): Promise<ActionResult> {
  try {
    clearWorkspaceMemory();
    clearEventMemory();
    for (const project of await listProjects()) {
      for (const client of (await loadProjectClients(project.id)) ?? []) {
        const proposal = await getProposal(client.id, project.id);
        if (proposal && proposal.status !== "draft") await saveProposal({ ...proposal, status: "draft" });
      }
    }
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
