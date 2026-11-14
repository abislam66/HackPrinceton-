import { z } from "zod";
import { pitchSchema } from "@/features/pitch/schema";
import { shotListSchema } from "@/features/shots/schema";

/** draft: generated, waiting for a person. approved: reviewed. sent: delivered to the client. */
export const proposalStatuses = ["draft", "approved", "sent"] as const;

/** One generated proposal for one client. Stored as a row in the `proposals` table. */
export const proposalSchema = z.object({
  clientId: z.string(),
  projectSlug: z.string(),
  status: z.enum(proposalStatuses),
  pitch: pitchSchema,
  shots: shotListSchema,
});
export type Proposal = z.infer<typeof proposalSchema>;
