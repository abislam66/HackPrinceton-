import { z } from "zod";
import { proposalStatuses } from "./schema";

export type ProposalStatus = (typeof proposalStatuses)[number];

/** Body of PATCH /api/proposals/[client]/status. */
export const statusUpdateSchema = z.object({ status: z.enum(proposalStatuses) });

/** Review flow: draft -> approved -> sent, and approved -> draft to send it back. Sent is final. */
const ALLOWED: Record<ProposalStatus, readonly ProposalStatus[]> = {
  draft: ["approved"],
  approved: ["sent", "draft"],
  sent: [],
};

export function canTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function allowedTransitions(from: ProposalStatus): readonly ProposalStatus[] {
  return ALLOWED[from];
}
