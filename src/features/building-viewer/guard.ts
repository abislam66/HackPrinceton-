import { timingSafeEqual } from "node:crypto";

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

type Window = { start: number; count: number };
const windows = new Map<string, Window>();

/**
 * Fixed one-hour window per client, RATE_LIMIT generations each. Returns the seconds to wait when
 * the limit is hit. This lives in one server instance; a serverless host can run several, so the
 * limit is a per-instance soft cap until a shared store is added (see DEPLOY.md).
 */
export function takeGeneration(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterS: number } {
  const current = windows.get(key);
  if (!current || now - current.start >= RATE_WINDOW_MS) {
    windows.set(key, { start: now, count: 1 });
    return { ok: true };
  }
  if (current.count >= RATE_LIMIT) {
    return { ok: false, retryAfterS: Math.ceil((current.start + RATE_WINDOW_MS - now) / 1000) };
  }
  current.count += 1;
  return { ok: true };
}
