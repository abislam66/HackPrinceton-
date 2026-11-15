import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { modelMetadataSchema, type ModelMetadata } from "./schema";

/*
 * Generated models (the building viewer's GLB plus its model.json), one per project. Same layout as a built model:
 * model.glb next to model.json.
 *
 * Storage is TEMPORARY: .data/generated-models/<project>/ locally, and process memory where the filesystem is
 * read-only (Vercel). Neither survives a redeploy on Vercel. Persistent storage (a Supabase table and bucket) is
 * proposed on issue #68 and not built until it is agreed.
 */

const DIR = path.join(process.cwd(), ".data", "generated-models");
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

type Stored = { meta: ModelMetadata; glb: Uint8Array };
const globalStore = globalThis as typeof globalThis & { __tmGeneratedModels?: Map<string, Stored> };
const memory: Map<string, Stored> = (globalStore.__tmGeneratedModels ??= new Map());

export function isGeneratedSlug(slug: string): boolean {
  return SLUG.test(slug);
}

/** Save a project's generated model. Returns where it went: "file" locally, "memory" on a read-only host. */
export async function saveGeneratedModel(slug: string, glb: Uint8Array, meta: ModelMetadata): Promise<"file" | "memory"> {
  if (!isGeneratedSlug(slug)) throw new Error(`Bad project id: ${slug}`);
  const checked = modelMetadataSchema.parse(meta);
  memory.set(slug, { meta: checked, glb });
  try {
    const dir = path.join(DIR, slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, checked.file), glb);
    await writeFile(path.join(dir, "model.json"), `${JSON.stringify(checked, null, 2)}\n`);
    return "file";
  } catch {
    return "memory";
  }
}

export async function loadGeneratedMeta(slug: string): Promise<ModelMetadata | null> {
  if (!isGeneratedSlug(slug)) return null;
  const cached = memory.get(slug);
  if (cached) return cached.meta;
  const raw = await readFile(path.join(DIR, slug, "model.json"), "utf8").catch(() => null);
  if (!raw) return null;
  const parsed = modelMetadataSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export async function loadGeneratedGlb(slug: string): Promise<Uint8Array | null> {
  if (!isGeneratedSlug(slug)) return null;
  const cached = memory.get(slug);
  if (cached) return cached.glb;
  const meta = await loadGeneratedMeta(slug);
  if (!meta) return null;
  const bytes = await readFile(path.join(DIR, slug, meta.file)).catch(() => null);
  return bytes ? new Uint8Array(bytes) : null;
}

/** The next version number for a project's generated model, so the viewer URL changes on every save. */
export async function nextGeneratedVersion(slug: string): Promise<number> {
  return ((await loadGeneratedMeta(slug))?.version ?? 0) + 1;
}
