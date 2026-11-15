"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import type { ViewerEvent, ViewerStep } from "@/features/building-viewer/schema";
import { exportGlb, saveModel } from "./save-model";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const TOO_LONG = "This took too long. Try again.";

const STEP_LABEL: Record<ViewerStep, string> = {
  geocode: "Finding the address",
  context: "Fetching nearby buildings",
  model: "Drafting the viewer with Claude",
  assemble: "Assembling the file",
};
const STEP_ORDER = Object.keys(STEP_LABEL) as ViewerStep[];

type StepState = { status: "start" | "done" | "skipped"; detail?: string };
type Result = Extract<ViewerEvent, { type: "result" }>;

/** What the form starts with when it is opened from a project. Every field stays editable. */
export type ViewerPrefill = {
  /** The project the form was opened from; the generated model is saved to it. */
  projectSlug?: string;
  address: string;
  buildingName: string;
  knownFacts: string;
  /** The project's first reference photo, fetched into the photo field on load. */
  photo?: { url: string; name: string };
};

type ModelState = { status: "idle" | "working" | "saved" | "failed"; message?: string };

/** Export the building as a GLB in a hidden sandboxed frame and save it as the project's model for the Shots tab. */
async function exportAndSaveModel(html: string, projectSlug: string, accessCode: string): Promise<ModelState> {
  try {
    await saveModel(await exportGlb(html), projectSlug, accessCode);
    return { status: "saved" };
  } catch (caught) {
    return { status: "failed", message: caught instanceof Error ? caught.message : "The 3D model could not be saved." };
  }
}

/** A message already written for the person reading it, shown as is. */
class ShownError extends Error {}

/** Friendly text for the step that failed. The server sends short messages; this adds the next action. */
function failureText(step: string, message: string): string {
  const hint: Record<string, string> = {
    access: "Check the access code and try again.",
    rate_limit: "Wait for the hour to pass, then try again.",
    validate: "Fix the highlighted input and try again.",
    geocode: "The address could not be located. Try a fuller street address.",
    context: "Nearby buildings could not be loaded. Try again in a minute.",
    model: "The viewer could not be drafted. Try again.",
    assemble: "The model's page did not pass the checks. Try again.",
  };
  return `${message} ${hint[step] ?? ""}`.trim();
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ViewerForm({ prefill }: { prefill?: ViewerPrefill }) {
  const [address, setAddress] = useState(prefill?.address ?? "");
  const [buildingName, setBuildingName] = useState(prefill?.buildingName ?? "");
  const [knownFacts, setKnownFacts] = useState(prefill?.knownFacts ?? "");
  const [notes, setNotes] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFromProject, setPhotoFromProject] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(Boolean(prefill?.photo));
  const [photoError, setPhotoError] = useState<string | undefined>();
  /** The project photo didn't load. A note, not an error: the run can go on without a photo. */
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | undefined>();
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [steps, setSteps] = useState<Partial<Record<ViewerStep, StepState>>>({});
  const [result, setResult] = useState<Result | null>(null);
  /** The 3D model for the Shots tab: exported from the viewer's building, then saved to the project. */
  const [modelState, setModelState] = useState<ModelState>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  /** Set once the user picks or removes a photo, so a late project photo doesn't replace their choice. */
  const photoTouched = useRef(false);
  const previewUrl = useRef<string | null>(null);

  function showPhoto(file: File | null, fromProject: boolean) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = file ? URL.createObjectURL(file) : null;
    setPhotoPreview(previewUrl.current);
    setPhoto(file);
    setPhotoFromProject(file !== null && fromProject);
  }

  /** Check a photo the browser can see. The server checks the bytes again. */
  function acceptPhoto(file: File | undefined, fromProject = false) {
    setPhotoError(undefined);
    if (!file) return showPhoto(null, false);
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      showPhoto(null, false);
      return setPhotoError("Use a JPEG or PNG photo.");
    }
    if (file.size > MAX_PHOTO_BYTES) {
      showPhoto(null, false);
      return setPhotoError("The photo is over 5 MB. Choose a smaller one.");
    }
    showPhoto(file, fromProject);
  }

  function pickPhoto(file: File | undefined) {
    photoTouched.current = true;
    setPhotoLoading(false);
    setPhotoNotice(null);
    acceptPhoto(file);
  }

  function removePhoto() {
    photoTouched.current = true;
    setPhotoError(undefined);
    setPhotoNotice(null);
    showPhoto(null, false);
    if (fileInput.current) fileInput.current.value = "";
  }

  // Fetch the project's reference photo into the photo field, as if the user had picked it.
  const prefillPhoto = prefill?.photo;
  useEffect(() => {
    if (!prefillPhoto) return;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(prefillPhoto.url, { signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        if (photoTouched.current) return;
        acceptPhoto(new File([blob], prefillPhoto.name, { type: blob.type }), true);
      } catch {
        if (controller.signal.aborted || photoTouched.current) return;
        setPhotoNotice("The project photo didn't load. Choose one, or go on without it.");
      } finally {
        if (!controller.signal.aborted) setPhotoLoading(false);
      }
    })();
    return () => controller.abort();
    // acceptPhoto only sets state; the fetch runs once per photo URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillPhoto?.url, prefillPhoto?.name]);

  // Free the preview's object URL when the form goes away.
  useEffect(() => () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

  // Count the seconds while a run is going: a run takes 1 to 5 minutes.
  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) return;
    setAddressError(undefined);
    setError(null);
    setResult(null);
    setModelState({ status: "idle" });
    setSteps({});
    if (address.trim().length < 5) return setAddressError("Enter a street address.");
    if (photoError) return;

    const body = new FormData();
    body.set("address", address);
    body.set("buildingName", buildingName);
    body.set("knownFacts", knownFacts);
    body.set("notes", notes);
    if (prefill?.projectSlug) body.set("projectSlug", prefill.projectSlug);
    if (photo) body.set("photo", photo);

    setRunning(true);
    setElapsed(0);
    setStartedAt(Date.now());
    let streaming = false;
    try {
      const response = await fetch("/api/building-viewer/generate", {
        method: "POST",
        headers: { "x-access-code": accessCode },
        body,
      });
      if (!response.ok || !response.body) {
        if (response.status === 504) throw new ShownError(TOO_LONG);
        const data = (await response.json().catch(() => ({}))) as { error?: string; step?: string };
        throw new ShownError(failureText(data.step ?? "model", data.error ?? "The request failed."));
      }
      streaming = true;
      let finished = false;
      await readEvents(response.body, (event) => {
        if (event.type === "step") {
          setSteps((s) => ({ ...s, [event.step]: { status: event.status, detail: event.detail } }));
        } else if (event.type === "result") {
          finished = true;
          setResult(event);
          if (prefill?.projectSlug) {
            setModelState({ status: "working" });
            void exportAndSaveModel(event.html, event.project_slug, accessCode).then(setModelState);
          } else {
            setModelState({ status: "failed", message: "Open this form from a project to save its 3D model for the Shots tab." });
          }
        } else {
          throw new ShownError(failureText(event.step, event.error));
        }
      });
      // The host stops the function at 300 s, which ends the stream with no result line.
      if (!finished) throw new ShownError(TOO_LONG);
    } catch (caught) {
      if (caught instanceof ShownError) setError(caught.message);
      else setError(streaming ? TOO_LONG : "Something went wrong. Try again.");
    } finally {
      setRunning(false);
      setStartedAt(null);
    }
  }

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.html], { type: "text/html" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "building-viewer.html";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <Panel title="Building">
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field label="Address" value={address} onChange={(e) => setAddress(e.target.value)} error={addressError} placeholder="1601 N Broad St, Philadelphia, PA" autoComplete="off" maxLength={200} />
          <Field label="Building name (optional)" value={buildingName} onChange={(e) => setBuildingName(e.target.value)} maxLength={120} />
          <Field label="Known facts (optional)" multiline rows={3} value={knownFacts} onChange={(e) => setKnownFacts(e.target.value)} maxLength={500} placeholder="For example: 27 floors, 92 m tall" />
          <Field label="Notes (optional)" multiline rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
          <div className="flex flex-col gap-2">
            <p className="app-field-label" id="viewer-photo-label">Photo (optional, JPEG or PNG, up to 5 MB)</p>
            {photo && photoPreview ? (
              <div className="flex items-center gap-3 border border-rule/40 bg-sheet p-2">
                {/* A local object URL, so next/image has nothing to optimize. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="" className="size-12 shrink-0 object-cover" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="tm-text--s truncate text-ink">{photo.name}</span>
                  <span className="tm-text--s tm-num text-muted">
                    {formatBytes(photo.size)}
                    {photoFromProject ? ". From the project" : ""}
                  </span>
                </div>
                <Button variant="tertiary" onClick={removePhoto} disabled={running}>
                  Remove
                </Button>
              </div>
            ) : photoLoading ? (
              <p className="tm-text--s text-muted" role="status">Loading the project photo…</p>
            ) : photoNotice ? (
              <p className="tm-text--s text-muted" role="status">{photoNotice}</p>
            ) : null}
            {/* The native picker reads "No file chosen" even when a project photo is set, so a button labels it instead. */}
            <div>
              <input
                ref={fileInput}
                id="viewer-photo"
                type="file"
                accept="image/jpeg,image/png"
                onChange={(e) => pickPhoto(e.target.files?.[0])}
                disabled={running}
                className="peer sr-only"
                aria-labelledby="viewer-photo-label viewer-photo-action"
                aria-describedby={photoError ? "viewer-photo-err" : undefined}
              />
              <label
                id="viewer-photo-action"
                htmlFor="viewer-photo"
                className="app-btn app-btn--secondary w-fit cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-asphalt peer-disabled:cursor-not-allowed"
              >
                {photo ? "Replace photo" : "Choose photo"}
              </label>
            </div>
            {photoError ? <p id="viewer-photo-err" className="app-field-error">{photoError}</p> : null}
          </div>
          <Field label="Access code" type="password" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} autoComplete="off" />
          <Button type="submit" variant="primary" pending={running} pendingLabel="Generating…">
            Generate viewer
          </Button>
        </form>
      </Panel>

      <div className="flex min-w-0 flex-col gap-6">
        {Object.keys(steps).length > 0 || running ? (
          <Panel title="Progress">
            <div className="flex flex-col gap-3">
              <ol className="flex flex-col gap-2 tm-text--s">
                {STEP_ORDER.map((step) => {
                  const state = steps[step];
                  const tone = state?.status === "done" ? "pass" : state?.status === "start" ? "running" : "neutral";
                  const label = state?.status === "skipped" ? "skipped" : state?.status === "done" ? "done" : state ? "working" : "waiting";
                  return (
                    <li key={step} className="flex flex-wrap items-center gap-2">
                      <Tag tone={tone}>{label}</Tag>
                      <span>{STEP_LABEL[step]}</span>
                      {state?.detail ? <span className="text-muted">· {state.detail}</span> : null}
                    </li>
                  );
                })}
              </ol>
              {running ? (
                <p className="tm-text--s text-muted" role="status">
                  <span className="tm-num">{formatElapsed(elapsed)}</span> so far. A run takes 1 to 5 minutes.
                </p>
              ) : null}
            </div>
          </Panel>
        ) : null}

        {error ? (
          <p role="alert" className="tm-text--s border border-rule/40 bg-sheet p-4 text-status-fail-ink">
            {error}
          </p>
        ) : null}

        {result ? (
          <>
            <Panel title="Viewer" action={<Button variant="secondary" onClick={download}>Download HTML</Button>} flush>
              <iframe
                title="Building viewer"
                sandbox="allow-scripts"
                srcDoc={result.html}
                className="h-[560px] w-full border-0"
              />
            </Panel>
            <Panel title="What the model says">
              <div className="flex flex-col gap-3 tm-text--s">
                <p className="whitespace-pre-wrap">{result.reply}</p>
                <p className="text-muted" role="status">
                  {modelState.status === "working" ? "Saving the 3D model for the Shots tab…" : null}
                  {modelState.status === "saved" ? "3D model saved. The Shots tab uses it for this project." : null}
                  {modelState.status === "failed" ? `3D model not saved: ${modelState.message}` : null}
                </p>
                <p className="text-muted">
                  Geocode: {result.geocode_status}. Nearby buildings: {result.context_status}.
                  {result.drift ? " The model changed locked code, so the locked scaffold was used." : ""}
                </p>
              </div>
            </Panel>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Read NDJSON lines from the stream and hand each parsed event to `onEvent`. */
async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (event: ViewerEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as ViewerEvent);
      newline = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) onEvent(JSON.parse(buffer.trim()) as ViewerEvent);
}
