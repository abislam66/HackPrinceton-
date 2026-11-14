import { z } from "zod";
import { buildingSides } from "@/features/model/schema";

/*
 * Shot intent: what the LLM picks for each shot. The compiler (compile.ts) turns it into a camera path.
 * Internal to generation, not a contract.
 */

export const shotMoves = ["rise", "orbit", "push-in", "track", "reveal", "ground-hero"] as const;
export type ShotMove = (typeof shotMoves)[number];

/** What the LLM picks for each shot. Internal to generation, not a contract. */
export const shotIntentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  platform: z.enum(["drone", "ground"]),
  lens: z.string().min(1),
  timeOfDay: z.string().min(1),
  constructionPhase: z.string().min(1),
  side: z.enum(buildingSides),
  move: z.enum(shotMoves),
  /** Multiple of the building's largest dimension. */
  distance: z.number().min(1.2).max(4),
  /** Multiple of the building's height. */
  height: z.number().min(0).max(1.6),
  durationSec: z.number().min(4).max(10),
});
export type ShotIntent = z.infer<typeof shotIntentSchema>;
