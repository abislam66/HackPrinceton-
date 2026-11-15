"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import type { ViewerEvent, ViewerStep } from "@/features/building-viewer/schema";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const STEP_LABEL: Record<ViewerStep, string> = {
  geocode: "Finding the address",
  context: "Fetching nearby buildings",
  model: "Drafting the viewer with Claude",
  assemble: "Assembling the file",
};
const STEP_ORDER = Object.keys(STEP_LABEL) as ViewerStep[];

type StepState = { status: "start" | "done" | "skipped"; detail?: string };
type Result = Extract<ViewerEvent, { type: "result" }>;

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

export function ViewerForm() {
  const [address, setAddress] = useState("");
  const [buildingName, setBuildingName] = useState("");
  const [knownFacts, setKnownFacts] = useState("");
  const [notes, setNotes] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | undefined>();
  const [addressError, setAddressError] = useState<string | undefined>();
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Partial<Record<ViewerStep, StepState>>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pickPhoto(file: File | undefined) {
    setPhotoError(undefined);
    if (!file) return setPhoto(null);
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setPhoto(null);
      return setPhotoError("Use a JPEG or PNG photo.");
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhoto(null);
      return setPhotoError("The photo is over 5 MB. Choose a smaller one.");
    }
    setPhoto(file);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) return;
    setAddressError(undefined);
    setError(null);
    setResult(null);
    setSteps({});
    if (address.trim().length < 5) return setAddressError("Enter a street address.");
    if (photoError) return;

    const body = new FormData();
    body.set("address", address);
    body.set("buildingName", buildingName);
    body.set("knownFacts", knownFacts);
    body.set("notes", notes);
    if (photo) body.set("photo", photo);

    setRunning(true);
    try {
      const response = await fetch("/api/building-viewer/generate", {
        method: "POST",
        headers: { "x-access-code": accessCode },
        body,
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string; step?: string };
        throw new Error(failureText(data.step ?? "model", data.error ?? "The request failed."));
      }
      await readEvents(response.body, (event) => {
        if (event.type === "step") {
          setSteps((s) => ({ ...s, [event.step]: { status: event.status, detail: event.detail } }));
        } else if (event.type === "result") {
          setResult(event);
        } else {
          throw new Error(failureText(event.step, event.error));
        }
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Try again.");
    } finally {
      setRunning(false);
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
          <Field label="Address" value={address} onChange={(e) => setAddress(e.target.value)} error={addressError} placeholder="1601 N Broad St, Philadelphia, PA" autoComplete="off" />
          <Field label="Building name (optional)" value={buildingName} onChange={(e) => setBuildingName(e.target.value)} maxLength={120} />
          <Field label="Known facts (optional)" multiline rows={3} value={knownFacts} onChange={(e) => setKnownFacts(e.target.value)} maxLength={500} placeholder="For example: 27 floors, 92 m tall" />
          <Field label="Notes (optional)" multiline rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
          <div className="flex flex-col gap-1.5">
            <label className="app-field-label" htmlFor="viewer-photo">Photo (optional, JPEG or PNG, up to 5 MB)</label>
            <input id="viewer-photo" type="file" accept="image/jpeg,image/png" onChange={(e) => pickPhoto(e.target.files?.[0])} className="text-sm" />
            {photoError ? <p className="text-sm text-red-700">{photoError}</p> : null}
          </div>
          <Field label="Access code" type="password" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} autoComplete="off" />
          <Button type="submit" disabled={running}>
            {running ? "Generating…" : "Generate viewer"}
          </Button>
        </form>
      </Panel>

      <div className="flex min-w-0 flex-col gap-6">
        {Object.keys(steps).length > 0 || running ? (
          <Panel title="Progress">
            <ol className="flex flex-col gap-2 text-sm">
              {STEP_ORDER.map((step) => {
                const state = steps[step];
                const tone = state?.status === "done" ? "pass" : state?.status === "start" ? "running" : "neutral";
                const label = state?.status === "skipped" ? "skipped" : state?.status === "done" ? "done" : state ? "working" : "waiting";
                return (
                  <li key={step} className="flex flex-wrap items-center gap-2">
                    <Tag tone={tone}>{label}</Tag>
                    <span>{STEP_LABEL[step]}</span>
                    {state?.detail ? <span className="text-zinc-500">· {state.detail}</span> : null}
                  </li>
                );
              })}
            </ol>
          </Panel>
        ) : null}

        {error ? <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}

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
              <div className="flex flex-col gap-3 text-sm">
                <p className="whitespace-pre-wrap">{result.reply}</p>
                <p className="text-zinc-500">
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
