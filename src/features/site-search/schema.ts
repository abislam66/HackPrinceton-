import { z } from "zod";

// Placeholder parameters. Replace with the real ones once the data model is settled.
export const siteSearchParamsSchema = z.object({
  region: z.string().optional(),
  minCapacityMw: z.number().positive().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export type SiteSearchParams = z.infer<typeof siteSearchParamsSchema>;

export type SiteSearchResult = {
  id: string;
  name: string;
  score: number;
};
