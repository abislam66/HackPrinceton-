import { loadGeneratedGlb } from "@/features/model/generated";

/** A generated project's GLB, for the Shots-tab viewer. 404 when the project has no generated model. */
export async function GET(_request: Request, ctx: RouteContext<"/api/models/[project]/model.glb">) {
  const { project } = await ctx.params;
  const glb = await loadGeneratedGlb(project);
  if (!glb) return new Response("No generated model for this project.", { status: 404 });
  return new Response(new Blob([glb as BlobPart]), {
    headers: { "Content-Type": "model/gltf-binary", "Cache-Control": "private, max-age=60" },
  });
}
