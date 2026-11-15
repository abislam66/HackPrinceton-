import "server-only";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";

/*
 * Storage for the live stages' results (scout runs, dossiers, outreach messages and the Gmail
 * state) while the demo has no Supabase keys. Records live in process memory and are written
 * through to .data/<collection>/<key>.json (gitignored), so a laptop demo survives a dev-server
 * restart. On Vercel the filesystem is read-only: records last as long as the instance, and the
 * screens fall back to the committed snapshots.
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

/** The record, from memory or disk, parsed with `schema`. Null when missing or invalid. */
export async function readRecord<T extends z.ZodType>(
  collection: string,
  key: string,
  schema: T,
): Promise<z.infer<T> | null> {
  check(collection, key);
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

/** Stores a record. Returns "file" when it reached disk, "memory" when only memory holds it. */
export async function writeRecord(collection: string, key: string, value: unknown): Promise<"file" | "memory"> {
  check(collection, key);
  bucket(collection).set(key, value);
  try {
    const dir = path.join(DATA_DIR, collection);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${key}.json`), `${JSON.stringify(value, null, 2)}\n`);
    return "file";
  } catch {
    return "memory";
  }
}

/** Every valid record in a collection (memory merged over disk), in no particular order. */
export async function listRecords<T extends z.ZodType>(collection: string, schema: T): Promise<z.infer<T>[]> {
  check(collection);
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
