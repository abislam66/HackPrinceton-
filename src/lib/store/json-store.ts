import "server-only";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRecordsStoreConfigured } from "@/lib/supabase/env";

/*
 * Storage for the live stages' results: scout runs, scouted projects, dossiers, generated models,
 * the project agent's projects, clients and drafts, outreach messages, the Gmail sync state, and
 * the building viewer's rate limit and map cache.
 *
 * Two backends, picked per call:
 * - Supabase, when NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are set: one row per record
 *   in public.records (supabase/migrations/20261115090000_records.sql). Every instance reads the
 *   same rows, so this is what a deployed app needs. A failed write throws.
 * - Files, otherwise (local development): records live in process memory and are written through
 *   to .data/<collection>/<key>.json (gitignored), so a laptop demo survives a restart. If the
 *   write fails (a read-only filesystem, such as Vercel without the keys) the record lives only in
 *   this instance's memory, and that is logged as an error.
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const NAME = /^[a-z0-9][a-z0-9-]*$/;

type Memory = Map<string, Map<string, unknown>>;
const globalStore = globalThis as typeof globalThis & { __tmJsonStore?: Memory };
const memory: Memory = (globalStore.__tmJsonStore ??= new Map());

function check(collection: string, key?: string): void {
  if (!NAME.test(collection)) throw new Error(`Bad collection name: ${collection}`);
  if (key !== undefined && !NAME.test(key)) throw new Error(`Bad record key: ${key}`);
}

function bucket(collection: string): Map<string, unknown> {
  let map = memory.get(collection);
  if (!map) {
    map = new Map();
    memory.set(collection, map);
  }
  return map;
}

/** Where writes go right now. */
export function storeBackend(): "supabase" | "files" {
  return isRecordsStoreConfigured() ? "supabase" : "files";
}

function parseWith<T extends z.ZodType>(schema: T, value: unknown, where: string): z.infer<T> | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  console.error(`Store record ${where} does not match its schema`, parsed.error.message);
  return null;
}

/** The record parsed with `schema`. Null when missing or invalid; a database error is logged. */
export async function readRecord<T extends z.ZodType>(
  collection: string,
  key: string,
  schema: T,
): Promise<z.infer<T> | null> {
  check(collection, key);
  if (storeBackend() === "supabase") {
    const { data, error } = await createAdminClient()
      .from("records")
      .select("data")
      .eq("collection", collection)
      .eq("key", key)
      .maybeSingle();
    if (error) {
      console.error(`Store read ${collection}/${key} failed`, error.message);
      return null;
    }
    return data ? parseWith(schema, data.data, `${collection}/${key}`) : null;
  }
  const cached = bucket(collection).get(key);
  if (cached !== undefined) {
    const parsed = schema.safeParse(cached);
    if (parsed.success) return parsed.data;
  }
  const raw = await readFile(path.join(DATA_DIR, collection, `${key}.json`), "utf8").catch(() => null);
  if (!raw) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    bucket(collection).set(key, parsed.data);
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * Stores a record. Returns where it went: "supabase", "file", or "memory" when only this
 * instance's memory holds it (logged as an error). Throws when the Supabase write fails.
 */
export async function writeRecord(
  collection: string,
  key: string,
  value: unknown,
): Promise<"supabase" | "file" | "memory"> {
  check(collection, key);
  if (storeBackend() === "supabase") {
    const { error } = await createAdminClient()
      .from("records")
      .upsert({ collection, key, data: value, updated_at: new Date().toISOString() });
    if (error) {
      console.error(`Store write ${collection}/${key} failed`, error.message);
      throw new Error(`Could not save ${collection}/${key}: ${error.message}`);
    }
    return "supabase";
  }
  bucket(collection).set(key, value);
  try {
    const dir = path.join(DATA_DIR, collection);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${key}.json`), `${JSON.stringify(value, null, 2)}\n`);
    return "file";
  } catch (error) {
    console.error(
      `Store write ${collection}/${key} reached only this instance's memory. ` +
        "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY to keep it.",
      error instanceof Error ? error.message : error,
    );
    return "memory";
  }
}

/** Every valid record in a collection, in no particular order. A database error is logged. */
export async function listRecords<T extends z.ZodType>(collection: string, schema: T): Promise<z.infer<T>[]> {
  check(collection);
  if (storeBackend() === "supabase") {
    const { data, error } = await createAdminClient().from("records").select("key, data").eq("collection", collection);
    if (error) {
      console.error(`Store list ${collection} failed`, error.message);
      return [];
    }
    return (data ?? [])
      .map((row: { key: string; data: unknown }) => parseWith(schema, row.data, `${collection}/${row.key}`))
      .filter((r): r is z.infer<T> => r !== null);
  }
  const files = await readdir(path.join(DATA_DIR, collection)).catch(() => [] as string[]);
  const keys = new Set([
    ...files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)),
    ...bucket(collection).keys(),
  ]);
  const records: (z.infer<T> | null)[] = await Promise.all(
    [...keys].filter((k) => NAME.test(k)).map((k) => readRecord(collection, k, schema)),
  );
  return records.filter((r) => r !== null) as z.infer<T>[];
}

/**
 * A committed snapshot file (path relative to the repo root), parsed with `schema`. Snapshots
 * are the last good live run, kept in git so the deployed demo has data with no key and no store.
 * List them in next.config.ts `outputFileTracingIncludes`.
 */
export async function readSnapshot<T extends z.ZodType>(relativePath: string, schema: T): Promise<z.infer<T> | null> {
  const raw = await readFile(path.join(process.cwd(), relativePath), "utf8").catch(() => null);
  if (!raw) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.error(`Snapshot ${relativePath} does not match its schema`, parsed.error.message);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

/** Test helper: forgets everything held in memory (files on disk are untouched). */
export function clearMemoryStore(): void {
  memory.clear();
}
