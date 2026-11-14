import { z } from "zod";

/** The single pre-loaded demo project. Its files live in data/<PROJECT_SLUG>/. */
export const PROJECT_SLUG = "demo-project";

export const projectSchema = z.object({
  slug: z.string(),
  name: z.string(),
  address: z.string(),
  location: z.object({ lat: z.number(), lng: z.number() }),
  buildingType: z.string(),
  scopeType: z.string(),
  timeline: z.string(),
  summary: z.string(),
});
export type Project = z.infer<typeof projectSchema>;

export const stakeholderRoles = ["general-contractor", "architect", "owner-developer", "trade"] as const;

export const needCategories = [
  "documentation",
  "self-promotion",
  "recruiting",
  "sales-and-bids",
  "investor-and-owner-updates",
  "community-and-pr",
] as const;

/** A client we pitch on the project. Needs are pre-loaded, never classified live. */
export const clientSchema = z.object({
  /** URL-safe id, also the file name: data/<project>/clients/<id>.json */
  id: z.string().regex(/^[a-z0-9-]+$/),
  company: z.string(),
  role: z.enum(stakeholderRoles),
  contact: z.object({ name: z.string(), title: z.string() }),
  need: z.enum(needCategories),
  needsNotes: z.string(),
  /** Parts of the building this client cares about, e.g. "curtain wall". */
  focusElements: z.array(z.string()),
});
export type Client = z.infer<typeof clientSchema>;
