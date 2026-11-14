import { z } from "zod";

export const policyScoreRequestSchema = z.object({
  /** 5-digit county FIPS code. */
  countyFips: z.string().regex(/^\d{5}$/),
});

export type PolicyScoreRequest = z.infer<typeof policyScoreRequestSchema>;

export type PolicyScoreResult = {
  countyFips: string;
  /** Placeholder scale: 0 (unfavorable) to 100 (favorable). */
  score: number;
  summary: string;
};
