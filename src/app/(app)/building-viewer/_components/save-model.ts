import { buildExportPage } from "@/features/building-viewer/export-glb";
import { extractSubjectBlock } from "@/features/building-viewer/prompt";

const EXPORT_TIMEOUT_MS = 30_000;

/** Run the viewer's subject code in a hidden sandboxed iframe and return the building as a GLB. */
export function exportGlb(viewerHtml: string): Promise<ArrayBuffer> {
  const page = buildExportPage(extractSubjectBlock(viewerHtml));
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts"); // no allow-same-origin: it can't reach this page
    frame.style.display = "none";
    const done = (action: () => void) => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      frame.remove();
      action();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return; // only our export frame
      const data = event.data as { type?: string; glb?: ArrayBuffer; message?: string };
      if (data?.type === "glb" && data.glb instanceof ArrayBuffer) done(() => resolve(data.glb as ArrayBuffer));
      else if (data?.type === "glb-error") done(() => reject(new Error(data.message || "The export failed.")));
    };
    const timer = setTimeout(() => done(() => reject(new Error("The 3D export took too long."))), EXPORT_TIMEOUT_MS);
    window.addEventListener("message", onMessage);
    frame.srcdoc = page;
    document.body.appendChild(frame);
  });
}

/** Upload the GLB; the server reads its bounding box, writes model.json and saves both for the project. */
export async function saveModel(glb: ArrayBuffer, projectSlug: string, accessCode: string): Promise<void> {
  const body = new FormData();
  body.set("projectSlug", projectSlug);
  body.set("glb", new File([glb], "model.glb", { type: "model/gltf-binary" }));
  const response = await fetch("/api/building-viewer/model", { method: "POST", headers: { "x-access-code": accessCode }, body });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Saving the model failed (${response.status}).`);
  }
}
