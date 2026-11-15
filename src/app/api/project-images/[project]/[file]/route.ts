import { readProjectImage } from "@/lib/project-images";

/**
 * GET one of a project's reference photos from data/<project>/images/<file>, read-only.
 * The building viewer page fetches it to prefill its photo field. Unknown or invalid names return 404.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/project-images/[project]/[file]">) {
  const { project, file } = await ctx.params;
  const image = await readProjectImage(project, file);
  if (!image) return Response.json({ error: "No such image." }, { status: 404 });
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.type,
      "Content-Length": String(image.bytes.byteLength),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
