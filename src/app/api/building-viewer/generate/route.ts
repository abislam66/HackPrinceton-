import { NextResponse } from "next/server";
import { accessCodeOk, clientKey, takeGeneration } from "@/features/building-viewer/guard";
import { generateViewer, StepError } from "@/features/building-viewer/generate";
import { detectPhotoType, MAX_PHOTO_BYTES, viewerFormSchema, type ViewerEvent, type PhotoMediaType } from "@/features/building-viewer/schema";

// The model call with web search can run for minutes. The repo's agent route uses 300 s on this host.
export const maxDuration = 300;

/**
 * POST multipart/form-data: address (required), buildingName, knownFacts, notes, photo (jpg/png, 5 MB),
 * and the access code in the x-access-code header.
 *
 * Refusals before any work return JSON { error, step }. Once the run starts, the response is NDJSON:
 * one ViewerEvent per line, ending with a "result" or an "error" line. Nothing is stored.
 */
export async function POST(request: Request) {
  const access = accessCodeOk(request.headers.get("x-access-code"), process.env.BUILDING_VIEWER_ACCESS_CODE);
  if (access === "not configured") {
    console.warn("building-viewer refused: BUILDING_VIEWER_ACCESS_CODE is not set");
    return NextResponse.json({ error: "The viewer generator isn't set up yet.", step: "access" }, { status: 503 });
  }
  if (access === "denied") {
    return NextResponse.json({ error: "That access code isn't right.", step: "access" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the form as multipart data.", step: "validate" }, { status: 400 });
  }
  const parsed = viewerFormSchema.safeParse({
    address: text(form, "address"),
    buildingName: text(form, "buildingName"),
    knownFacts: text(form, "knownFacts"),
    notes: text(form, "notes"),
    projectSlug: text(form, "projectSlug") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form.", step: "validate" }, { status: 400 });
  }

  let photo: { bytes: Uint8Array; mediaType: PhotoMediaType } | null = null;
  const file = form.get("photo");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "The photo is over 5 MB. Choose a smaller one.", step: "validate" }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mediaType = detectPhotoType(bytes);
    if (!mediaType) {
      return NextResponse.json({ error: "The photo must be a JPEG or PNG.", step: "validate" }, { status: 400 });
    }
    photo = { bytes, mediaType };
  }

  // Count a run only once the access code and the input have passed, so a rejected request is free.
  const limit = await takeGeneration(clientKey(request.headers));
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You've made 5 viewers in the last hour. Try again later.", step: "rate_limit" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ViewerEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await generateViewer(parsed.data, photo, emit);
        emit(result);
      } catch (error) {
        const step = error instanceof StepError ? error.step : "model";
        const message = error instanceof StepError ? error.message : "Generation failed. Try again.";
        if (!(error instanceof StepError)) console.error(`building-viewer failed: ${(error as Error).name}`);
        emit({ type: "error", error: message, step });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}
