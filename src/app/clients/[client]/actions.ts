"use server";

import { refresh, revalidatePath } from "next/cache";
import { loadModelInfo } from "@/features/model/load";
import { loadClient } from "@/features/project/load";
import type { Proposal } from "@/features/proposal/schema";
import { loadProposal, setProposalStatus } from "@/lib/proposals";

type Status = Proposal["status"];

/**
 * Moves a client's proposal from one status to the next. The client id comes from the form,
 * so it is checked against the client files, and the move only happens from the expected status.
 */
async function move(formData: FormData, from: Status, to: Status): Promise<void> {
  const id = formData.get("client");
  if (typeof id !== "string") return;
  const client = await loadClient(id);
  if (!client) return;

  const model = await loadModelInfo();
  const loaded = await loadProposal(client, model);
  if (!loaded || loaded.proposal.status !== from) return;

  await setProposalStatus(client, model, to);

  revalidatePath("/");
  revalidatePath(`/clients/${client.id}`);
  revalidatePath(`/clients/${client.id}/send`);
  refresh();
}

export async function approveProposal(formData: FormData): Promise<void> {
  await move(formData, "draft", "approved");
}

export async function returnToDraft(formData: FormData): Promise<void> {
  await move(formData, "approved", "draft");
}

export async function markAsSent(formData: FormData): Promise<void> {
  await move(formData, "approved", "sent");
}
