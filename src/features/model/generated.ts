import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readRecord, storeBackend, writeRecord } from "@/lib/store/json-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { modelMetadataSchema, type ModelMetadata } from "./schema";

/*
 * Generated models (the building viewer's GLB plus its model.json), one per project. Same layout as a built model:
 * model.glb next to model.json.
 *
 * Two backends, picked per call (the same switch as src/lib/store/json-store.ts):
 * - Supabase, when NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are set: model.json is a row in public.records
 *   (collection "generated-models", key = the project slug) and the GLB is the object models/<slug>/model.glb in the
 *   private "models" bucket (supabase/migrations/20261115120000_models_bucket.sql). Every instance sees the same
 *   model. A failed write throws; it never falls back to memory, which would lose the model on the next cold start.
 * - The temporary store, otherwise (local development without keys): .data/generated-models/<slug>/ and process
 *   memory where the filesystem is read-only. It does not survive a redeploy on Vercel.
 */

const BUCKET = "models";
const COLLECTION = "generated-models";
const GLB_FILE = "model.glb";
const DIR = path.join(process.cwd(), ".data", "generated-models");
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

type Stored = { meta: ModelMetadata; glb: Uint8Array };
const globalStore = globalThis as typeof globalThis & { __tmGeneratedModels?: Map<string, Stored> };
const memory: Map<string, Stored> = (globalStore.__tmGeneratedModels ??= new Map());

export function isGeneratedSlug(slug: string): boolean {
  return SLUG.test(slug);
}

/**
 * Save a project's generated model. Returns where it went: "supabase", "file" locally without keys, or "memory" on a
 * read-only host without keys. Throws when a Supabase write fails.
 */
export async function saveGeneratedModel(slug: string, glb: Uint8Array, meta: ModelMetadata): Promise<"supabase" | "file" | "memory"> {
  if (!isGeneratedSlug(slug)) throw new Error(`Bad project id: ${slug}`);
  const checked = modelMetadataSchema.parse(meta);
  if (storeBackend() === "supabase") return saveToSupabase(slug, glb, checked);
  return saveToTemporaryStore(slug, glb, checked);
}

export async function loadGeneratedMeta(slug: string): Promise<ModelMetadata | null> {
  if (!isGeneratedSlug(slug)) return null;
  if (storeBackend() === "supabase") return readRecord(COLLECTION, slug, modelMetadataSchema);
  return loadTemporaryMeta(slug);
}

export async function loadGeneratedGlb(slug: string): Promise<Uint8Array | null> {
  if (!isGeneratedSlug(slug)) return null;
  if (storeBackend() === "supabase") return downloadFromBucket(slug);
  return loadTemporaryGlb(slug);
}

/** The next version number for a project's generated model, so the viewer URL changes on every save. */
export async function nextGeneratedVersion(slug: string): Promise<number> {
  return ((await loadGeneratedMeta(slug))?.version ?? 0) + 1;
}

// Supabase: the records table for model.json, the models bucket for the GLB.

async function saveToSupabase(slug: string, glb: Uint8Array, meta: ModelMetadata): Promise<"supabase"> {
  if (meta.file !== GLB_FILE) throw new Error(`A generated model's GLB must be named ${GLB_FILE}, got ${meta.file}`);
  // GLB first. A model.json that points at a missing file breaks the Shots tab; a new GLB under the old model.json
  // (when the record write then fails) only shows the previous bounding box until the save is retried.
  const { error } = await createAdminClient()
    .storage.from(BUCKET)
    .upload(`${slug}/${GLB_FILE}`, glb, { contentType: "model/gltf-binary", upsert: true });
  if (error) {
    console.error(`Store write ${BUCKET}/${slug}/${GLB_FILE} failed`, error.message);
    throw new Error(`Could not save the GLB for ${slug}: ${error.message}`);
  }
  await writeRecord(COLLECTION, slug, meta);
  return "supabase";
}

async function downloadFromBucket(slug: string): Promise<Uint8Array | null> {
  const { data, error } = await createAdminClient().storage.from(BUCKET).download(`${slug}/${GLB_FILE}`);
  if (error || !data) {
    if (error && !/not found/i.test(error.message)) console.error(`Store read ${BUCKET}/${slug}/${GLB_FILE} failed`, error.message);
    return null;
  }
  return new Uint8Array(await data.arrayBuffer());
}

// The temporary store, for development without Supabase keys.

async function saveToTemporaryStore(slug: string, glb: Uint8Array, meta: ModelMetadata): Promise<"file" | "memory"> {
  memory.set(slug, { meta, glb });
  try {
    const dir = path.join(DIR, slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, meta.file), glb);
    await writeFile(path.join(dir, "model.json"), `${JSON.stringify(meta, null, 2)}\n`);
    return "file";
  } catch {
    return "memory";
  }
}

async function loadTemporaryMeta(slug: string): Promise<ModelMetadata | null> {
  const cached = memory.get(slug);
  if (cached) return cached.meta;
  const raw = await readFile(path.join(DIR, slug, "model.json"), "utf8").catch(() => null);
  if (!raw) return null;
  const parsed = modelMetadataSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

async function loadTemporaryGlb(slug: string): Promise<Uint8Array | null> {
  const cached = memory.get(slug);
  if (cached) return cached.glb;
  const meta = await loadTemporaryMeta(slug);
  if (!meta) return null;
  const bytes = await readFile(path.join(DIR, slug, meta.file)).catch(() => null);
  return bytes ? new Uint8Array(bytes) : null;
}
