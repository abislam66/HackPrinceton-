import { NextResponse } from "next/server";
import { accessCodeOk } from "@/features/building-viewer/guard";
import { validateModelJson } from "@/features/building-viewer/model-json";
import { GlbError, glbBoundingBox } from "@/features/model/glb-bounds";
import { isGeneratedSlug, nextGeneratedVersion, saveGeneratedModel } from "@/features/model/generated";
import { buildingSides } from "@/features/model/schema";
import { loadProjectFacts } from "@/features/project-agent/store";
import { PROJECT_SLUG } from "@/features/project/schema";
import { getScoutedProject } from "@/features/scout/projects";

const MAX_GLB_BYTES = 20 * 1024 * 1024;

/**
 * POST multipart/form-data: projectSlug and glb (the GLB the page exported from the generated viewer), with the
 * access code in x-access-code. The server reads the bounding box from the GLB itself, writes model.json in the
 * model builder's schema, and saves both as the project's model, so the Shots tab and the shot compiler use it.
 *
 * Generated projects allow every side for shots (inferred sides included); the generate route's reply says which
 * sides the photo backs. The demo project keeps its built model and is refused.
 *
 * 200 { model, storage }; 400/401/404/503 { error, step }.
 */
export async function POST(request: Request) {
  const access = accessCodeOk(request.headers.get("x-access-code"), process.env.BUILDING_VIEWER_ACCESS_CODE);
  if (access === "not configured") return NextResponse.json({ error: "The viewer generator isn't set up yet.", step: "access" }, { status: 503 });
  if (access === "denied") return NextResponse.json({ error: "That access code isn't right.", step: "access" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the model as multipart data.", step: "validate" }, { status: 400 });
  }
  const slug = String(form.get("projectSlug") ?? "");
  if (!isGeneratedSlug(slug)) return NextResponse.json({ error: "Give a project id.", step: "validate" }, { status: 400 });
  if (slug === PROJECT_SLUG) {
    return NextResponse.json({ error: "The demo project keeps its built model.", step: "validate" }, { status: 400 });
  }
  if (!(await loadProjectFacts(slug)) && !(await getScoutedProject(slug))) {
    return NextResponse.json({ error: `Unknown project: ${slug}`, step: "validate" }, { status: 404 });
  }

  const file = form.get("glb");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Attach the GLB.", step: "validate" }, { status: 400 });
  if (file.size > MAX_GLB_BYTES) return NextResponse.json({ error: "The GLB is over 20 MB.", step: "validate" }, { status: 400 });
  const glb = new Uint8Array(await file.arrayBuffer());

  let boundingBox;
  try {
    boundingBox = glbBoundingBox(glb);
  } catch (error) {
    if (error instanceof GlbError) return NextResponse.json({ error: error.message, step: "validate" }, { status: 400 });
    throw error;
  }
  const checked = validateModelJson({ boundingBox, knownSides: [...buildingSides] }, slug);
  if (!checked.ok) return NextResponse.json({ error: checked.errors.join("; "), step: "validate" }, { status: 400 });

  const model = { ...checked.model, version: await nextGeneratedVersion(slug) };
  const storage = await saveGeneratedModel(slug, glb, model);
  console.info(`building-viewer model saved project=${slug} bytes=${glb.length} storage=${storage}`);
  return NextResponse.json({ model, storage });
}
