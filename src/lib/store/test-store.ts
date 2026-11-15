import type { z } from "zod";

/*
 * In-memory stand-in for json-store, for tests that must never write .data/ or reach Supabase:
 *   vi.mock("@/lib/store/json-store", () => import("@/lib/store/test-store"));
 */

const records = new Map<string, unknown>();

export function storeBackend(): "files" {
  return "files";
}

export async function readRecord<T extends z.ZodType>(collection: string, key: string, schema: T): Promise<z.infer<T> | null> {
  const value = records.get(`${collection}/${key}`);
  if (value === undefined) return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function writeRecord(collection: string, key: string, value: unknown): Promise<"memory"> {
  records.set(`${collection}/${key}`, structuredClone(value));
  return "memory";
}

export async function listRecords<T extends z.ZodType>(collection: string, schema: T): Promise<z.infer<T>[]> {
  return [...records.entries()]
    .filter(([k]) => k.startsWith(`${collection}/`))
    .map(([, v]) => schema.safeParse(v))
    .filter((p) => p.success)
    .map((p) => p.data);
}

export async function readSnapshot(): Promise<null> {
  return null;
}

export function clearMemoryStore(): void {
  records.clear();
}
