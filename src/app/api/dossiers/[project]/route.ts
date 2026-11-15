import { loadDossier } from "@/features/dossier/load";

const PROJECT_ID = /^[a-z0-9-]+$/;

/** The latest dossier for a project as `{ source, data }` (store, else committed snapshot), or 404. */
export async function GET(_request: Request, ctx: RouteContext<"/api/dossiers/[project]">) {
  const { project } = await ctx.params;
  if (!PROJECT_ID.test(project)) return Response.json({ error: "Bad project id" }, { status: 400 });

  const dossier = await loadDossier(project);
  if (!dossier) return Response.json({ error: `No dossier for ${project}` }, { status: 404 });
  return Response.json(dossier, { headers: { "cache-control": "no-store" } });
}
