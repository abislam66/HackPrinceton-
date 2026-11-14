import { z } from "zod";

/** The copy on a proposal page. No pricing or scope, ever. */
export const pitchSchema = z.object({
  /** Text over the opening fly-up. */
  teaserLine: z.string(),
  headline: z.string(),
  problem: z.string(),
  solution: z.string(),
});
export type Pitch = z.infer<typeof pitchSchema>;
