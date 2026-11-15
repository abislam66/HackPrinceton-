import "server-only";
import type { Object3D } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

/*
 * Exporting a built scene (scene.ts) as a binary glTF, on the server. three's GLTFExporter needs only one browser API
 * for a scene with no textures: FileReader, to turn its Blob into bytes. Node has Blob but not FileReader, so a small
 * stand-in is installed once. Generated scenes never use textures (the look lives in the material extras).
 */

type ReaderTarget = { result: ArrayBuffer | string | null; onload?: () => void; onloadend?: () => void; onerror?: (e: unknown) => void };

class BlobReader implements ReaderTarget {
  result: ArrayBuffer | string | null = null;
  onload?: () => void;
  onloadend?: () => void;
  onerror?: (e: unknown) => void;

  readAsArrayBuffer(blob: Blob) {
    this.finish(blob.arrayBuffer());
  }

  readAsDataURL(blob: Blob) {
    this.finish(blob.arrayBuffer().then((buffer) => `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(buffer).toString("base64")}`));
  }

  private finish(work: Promise<ArrayBuffer | string>) {
    work.then(
      (value) => {
        this.result = value;
        this.onload?.();
        this.onloadend?.();
      },
      (error) => this.onerror?.(error),
    );
  }
}

function ensureFileReader() {
  const g = globalThis as { FileReader?: unknown };
  if (typeof g.FileReader === "undefined") g.FileReader = BlobReader;
}

/** The scene as GLB bytes (glTF 2, binary). */
export async function exportGlb(root: Object3D): Promise<Uint8Array> {
  ensureFileReader();
  const out = await new GLTFExporter().parseAsync(root, { binary: true });
  if (!(out instanceof ArrayBuffer)) throw new Error("The GLB export returned JSON, not binary.");
  return new Uint8Array(out);
}
