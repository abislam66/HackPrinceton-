import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { readRecord, writeRecord } from "@/lib/store/json-store";

/*
 * Access code and rate limit for the viewer generator. The generator spends paid model calls, so it
 * fails closed: with no access code configured, nobody can generate.
 */

export const RATE_LIMIT = 5;
export const RATE_WINDOW_MS = 60 * 60 * 1000;

/** Compare the header with BUILDING_VIEWER_ACCESS_CODE in constant time. */
export function accessCodeOk(provided: string | null, expected: string | undefined): "ok" | "not configured" | "denied" {
  if (!expected) return "not configured";
  if (!provided) return "denied";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return "denied";
  return timingSafeEqual(a, b) ? "ok" : "denied";
}

/** Client key from the first proxy address, the same one the host logs. Falls back to one shared bucket. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}

const RATE_COLLECTION = "viewer-rate";
const windowSchema = z.object({ start: z.number(), count: z.number().int() });

/** Store key for a client: a hash, so raw IP addresses are never stored. */
function rateKey(client: string): string {
  return createHash("sha256").update(client).digest("hex").slice(0, 40);
}

/**
 * Fixed one-hour window per client, RATE_LIMIT generations each. Returns the seconds to wait when
 * the limit is hit. The window lives in the shared store (Supabase when configured), so every
 * server instance counts against the same limit. Two requests landing at the same instant can both
 * pass; that's acceptable for a soft cap on a demo.
 */
export async function takeGeneration(key: string, now = Date.now()): Promise<{ ok: true } | { ok: false; retryAfterS: number }> {
  const id = rateKey(key);
  const current = await readRecord(RATE_COLLECTION, id, windowSchema);
  if (!current || now - current.start >= RATE_WINDOW_MS) {
    await writeRecord(RATE_COLLECTION, id, { start: now, count: 1 });
    return { ok: true };
  }
  if (current.count >= RATE_LIMIT) {
    return { ok: false, retryAfterS: Math.ceil((current.start + RATE_WINDOW_MS - now) / 1000) };
  }
  await writeRecord(RATE_COLLECTION, id, { start: current.start, count: current.count + 1 });
  return { ok: true };
}
