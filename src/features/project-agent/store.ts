import "server-only";
import { z } from "zod";
import { loadClients, loadProject } from "@/features/project/load";
import { clientSchema, PROJECT_SLUG, type Client, type Project } from "@/features/project/schema";
import { proposalSchema } from "@/features/proposal/schema";
import { scenarioSchema } from "@/features/proposal/scenario";
import { listRecords, readRecord, writeRecord } from "@/lib/store/json-store";

/*
 * What the project agent changes, kept in the shared json store (.data/, gitignored; memory on
 * Vercel). data/ stays the pre-loaded base and is never written.
 *
 * - projects:         projects opened from a draft ("New project"), each based on the demo project.
 * - project-clients:  a project's stakeholders as changed by the agent (key `<project>--<client>`).
 *                     For the base project they override or add to data/; a new project lists all of its own.
 * - project-drafts:   changes the agent drafted, waiting for Replace / New project / Discard.
 */

const PROJECTS = "projects";
const CLIENTS = "project-clients";
const DRAFTS = "project-drafts";

export const projectRecordSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  basedOn: z.string(),
  name: z.string(),
  createdAt: z.string(),
  /** The change that opened it, in the team's words. */
  request: z.string(),
  fromDraft: z.string(),
});
export type ProjectRecord = z.infer<typeof projectRecordSchema>;

const projectClientSchema = z.object({ projectSlug: z.string(), client: clientSchema, updatedAt: z.string() });

export const draftStatuses = ["pending", "replaced", "new-project", "discarded"] as const;

export const projectDraftSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  projectSlug: z.string(),
  createdAt: z.string(),
  /** The change, in the team's words. */
  request: z.string(),
  kind: z.enum(["update", "new-stakeholder"]),
  /** The stakeholder it changes, or the id the new stakeholder gets. */
  clientId: z.string(),
  /** The stakeholder's brief after the change. */
  client: clientSchema,
  scenario: scenarioSchema,
  /** The proposal regenerated for the changed brief. */
  proposal: proposalSchema,
  status: z.enum(draftStatuses),
  resolvedAt: z.string().optional(),
  newProjectId: z.string().optional(),
});
export type ProjectDraft = z.infer<typeof projectDraftSchema>;

/** Every project: the pre-loaded demo project first, then the ones opened from drafts, oldest first. */
export async function listProjects(): Promise<{ id: string; name: string; basedOn: string | null; createdAt: string | null }[]> {
  const [base, records] = await Promise.all([loadProject(), listRecords(PROJECTS, projectRecordSchema)]);
  return [
    { id: PROJECT_SLUG, name: base.name, basedOn: null, createdAt: null },
    ...records
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((r) => ({ id: r.id, name: r.name, basedOn: r.basedOn, createdAt: r.createdAt })),
  ];
}

export async function getProjectRecord(projectSlug: string): Promise<ProjectRecord | null> {
  if (!/^[a-z0-9-]+$/.test(projectSlug) || projectSlug === PROJECT_SLUG) return null;
  return readRecord(PROJECTS, projectSlug, projectRecordSchema);
}

/** The project's facts. A project opened from a draft shares the base project's building facts. */
export async function loadProjectFacts(projectSlug: string): Promise<(Project & { slug: string }) | null> {
  if (projectSlug === PROJECT_SLUG) return loadProject();
  const record = await getProjectRecord(projectSlug);
  if (!record) return null;
  const base = await loadProject();
  return { ...base, slug: record.id, name: record.name };
}

/**
 * The project's stakeholders. Base project: data/ with the agent's replacements and additions on
 * top. A project opened from a draft: only its own stakeholders. Null for an unknown project.
 */
export async function loadProjectClients(projectSlug: string): Promise<Client[] | null> {
  const own = (await listRecords(CLIENTS, projectClientSchema))
    .filter((r) => r.projectSlug === projectSlug)
    .map((r) => r.client);
  if (projectSlug === PROJECT_SLUG) {
    const base = await loadClients();
    const overrides = new Map(own.map((c) => [c.id, c]));
    const merged = base.map((c) => overrides.get(c.id) ?? c);
    const added = own.filter((c) => !base.some((b) => b.id === c.id));
    return [...merged, ...added.sort((a, b) => a.id.localeCompare(b.id))];
  }
  if (!(await getProjectRecord(projectSlug))) return null;
  return own.sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadProjectClient(projectSlug: string, clientId: string): Promise<Client | null> {
  return (await loadProjectClients(projectSlug))?.find((c) => c.id === clientId) ?? null;
}

export async function saveProjectClient(projectSlug: string, client: Client): Promise<void> {
  await writeRecord(CLIENTS, `${projectSlug}--${client.id}`, { projectSlug, client, updatedAt: new Date().toISOString() });
}

export async function saveProjectRecord(record: ProjectRecord): Promise<void> {
  await writeRecord(PROJECTS, record.id, projectRecordSchema.parse(record));
}

export async function saveDraft(draft: ProjectDraft): Promise<void> {
  await writeRecord(DRAFTS, draft.id, projectDraftSchema.parse(draft));
}

export async function getDraft(projectSlug: string, id: string): Promise<ProjectDraft | null> {
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  const draft = await readRecord(DRAFTS, id, projectDraftSchema);
  return draft && draft.projectSlug === projectSlug ? draft : null;
}

/** The project's drafts, newest first. */
export async function listDrafts(projectSlug: string): Promise<ProjectDraft[]> {
  return (await listRecords(DRAFTS, projectDraftSchema))
    .filter((d) => d.projectSlug === projectSlug)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
