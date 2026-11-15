import { z } from "zod";
import { firmRoles, sourceSchema } from "@/lib/agent/schema";

/*
 * The dossier: what the agent learned about one project from public sources. Same sections as
 * the dossier screen (building, people and firms, timeline, sources); every fact cites ids from
 * `sources`. No personal emails or phone numbers: firms get their public website and contact page.
 */

const sourceIds = z.array(z.string().regex(/^S\d+$/));

export const dossierFactSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  sourceIds: sourceIds.min(1),
});
export type DossierFact = z.infer<typeof dossierFactSchema>;

export const dossierFirmSchema = z.object({
  name: z.string().min(1),
  role: z.enum(firmRoles),
  /** What the firm did on this project, e.g. "Curtain wall fabrication and installation". */
  scope: z.string().nullable(),
  /** The firm's own site. */
  website: z.url().nullable(),
  /** A public contact or "work with us" page. Never a personal email address. */
  contactUrl: z.url().nullable(),
  /** e.g. "Philadelphia, PA". */
  headquarters: z.string().nullable(),
  sourceIds: sourceIds.min(1),
});
export type DossierFirm = z.infer<typeof dossierFirmSchema>;

export const dossierEventSchema = z.object({
  /** As the sources say it, e.g. "Spring 2011" or "July 2012". */
  when: z.string().min(1),
  what: z.string().min(1),
  sourceIds: sourceIds.min(1),
});
export type DossierEvent = z.infer<typeof dossierEventSchema>;

export const dossierSchema = z.object({
  /** "demo-project" for Morgan Hall North, otherwise a scout candidate id. */
  projectId: z.string().regex(/^[a-z0-9-]+$/),
  projectName: z.string().min(1),
  address: z.string().nullable(),
  runAt: z.iso.datetime(),
  summary: z.object({ text: z.string().min(1), sourceIds: sourceIds.min(1) }),
  /** The short facts row under the project header: floors, height, completed, units, architect. */
  keyFacts: z.array(dossierFactSchema),
  building: z.array(dossierFactSchema),
  firms: z.array(dossierFirmSchema),
  /** Key roles no source confirmed, in this order: owner, architect, general contractor, facade. */
  missingRoles: z.array(z.enum(firmRoles)),
  timeline: z.array(dossierEventSchema),
  sources: z.array(sourceSchema),
});
export type Dossier = z.infer<typeof dossierSchema>;

/** What the dossier researches. Built from project.json or a scout candidate. */
export const dossierTargetSchema = z.object({
  projectId: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  /** Facts already known (from scouting), to steer the research. */
  hints: z.array(z.string()).default([]),
});
export type DossierTarget = z.infer<typeof dossierTargetSchema>;
