import { z } from "zod";

/** The copy on a proposal page. No pricing or scope, ever. */
export const pitchSchema = z.object({
  /** Text over the opening fly-up. */
  teaserLine: z.string(),
  headline: z.string(),
  problem: z.string(),
  solution: z.string(),
  /** One line per shot, shown with it, e.g. "Here we focus on the curtain wall." */
  shotCaptions: z.array(
    z.object({
      /** The `id` of a shot in the same proposal's shot list. */
      shotId: z.string(),
      caption: z.string(),
    }),
  ),
  /** The line saying Tradesmark is working across the whole project, not only for this client. */
  acrossProject: z.string(),
});
export type Pitch = z.infer<typeof pitchSchema>;
