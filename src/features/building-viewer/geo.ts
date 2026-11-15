/*
 * Map facts for the viewer, fetched by the backend only. The model never fetches map data.
 * Coordinates are metres from the geocoded point (the subject), x east, z south (the scaffold's
 * convention is +x east and +z toward the viewer; here z = -north so it matches model-builder).
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { readRecord, writeRecord } from "@/lib/store/json-store";

export const CONTEXT_RADIUS_M = 150;
export const MAX_CONTEXT = 40;
export const OVERPASS_TIMEOUT_S = 15;
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const LEVEL_HEIGHT_M = 4.2;
export const DEFAULT_HEIGHT_M = 12;
const USER_AGENT = "HackPrinceton-building-viewer/0.1 (hackathon demo)";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const METERS_PER_DEG_LAT = 110_574;
const METERS_PER_DEG_LNG = 111_320;

export type ContextItem = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  source: string;
  height_status: string;
};

export type LatLng = { lat: number; lng: number };

/** Geocoding result: the point, or null with the reason shown to the model and the user. */
export type GeocodeResult = { point: LatLng; status: "retrieved" } | { point: null; status: "not retrieved" };

/**
 * Why a geocode failed, for the server log: Google's own status and error_message when it answered, the HTTP status
 * when it didn't, or a missing key. Never the request URL (it carries the key) and never the address.
 */
function logGeocodeFailure(reason: string) {
  console.warn(`building-viewer geocode not retrieved: ${reason}`);
}

/** Google Geocoding. Never throws; a failure returns "not retrieved" so the run can continue, and logs why. */
export async function geocodeAddress(address: string, key: string | undefined): Promise<GeocodeResult> {
  if (!key) {
    logGeocodeFailure("no key configured (GOOGLE_MAPS_KEY is not set)");
    return { point: null, status: "not retrieved" };
  }
  try {
    const url = new URL(GEOCODE_URL);
    url.searchParams.set("address", address);
    url.searchParams.set("key", key);
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!res.ok) {
      logGeocodeFailure(`HTTP ${res.status}`);
      return { point: null, status: "not retrieved" };
    }
    const data = (await res.json()) as { status?: string; error_message?: string; results?: { geometry?: { location?: LatLng } }[] };
    const loc = data.results?.[0]?.geometry?.location;
    if (data.status !== "OK" || !loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
      // Google's message describes the problem (e.g. "This IP ... is not authorized"). It doesn't echo the key or the
      // address today; strip both anyway, so the log can never carry either.
      const message = (data.error_message ?? "none").split(key).join("[key]").split(address).join("[address]").slice(0, 300);
      logGeocodeFailure(`HTTP ${res.status}, status=${data.status ?? "missing"}, error_message=${message}`);
      return { point: null, status: "not retrieved" };
    }
    return { point: { lat: loc.lat, lng: loc.lng }, status: "retrieved" };
  } catch (error) {
    logGeocodeFailure(`request failed (${(error as Error).name})`);
    return { point: null, status: "not retrieved" };
  }
}

type OsmElement = {
  type?: string;
  id?: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
};

function ring(element: OsmElement): { lat: number; lon: number }[] {
  return (element.geometry ?? []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

/** Height from OSM tags: height (m or ft), else building:levels x 4.2 m, else the 12 m default (inferred). */
export function heightOf(tags: Record<string, string>): { h: number; height_status: string } {
  const raw = tags.height?.trim();
  if (raw) {
    const match = /^(\d+(?:\.\d+)?)\s*(m|ft)?$/i.exec(raw);
    if (match) {
      const value = Number(match[1]) * (match[2]?.toLowerCase() === "ft" ? 0.3048 : 1);
      if (value > 0) return { h: round1(value), height_status: "observed: OSM height tag" };
    }
  }
  const levels = Number(tags["building:levels"]);
  if (Number.isFinite(levels) && levels > 0) {
    return { h: round1(levels * LEVEL_HEIGHT_M), height_status: `estimated: OSM building:levels ${levels} x 4.2 m` };
  }
  return { h: DEFAULT_HEIGHT_M, height_status: "inferred: default 12 m" };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Point in a ring, by ray casting on lat/lon. Used to drop the subject building itself. */
function containsPoint(poly: { lat: number; lon: number }[], lat: number, lon: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.lat > lat !== b.lat > lat && lon < ((b.lon - a.lon) * (lat - a.lat)) / (b.lat - a.lat) + a.lon) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Turn Overpass building ways into context items relative to the geocoded point.
 * Drops the building the point sits in, anything beyond the radius, and degenerate outlines.
 * Nearest first, capped at MAX_CONTEXT.
 */
export function toContext(elements: OsmElement[], origin: LatLng): ContextItem[] {
  const items: (ContextItem & { dist: number })[] = [];
  for (const el of elements) {
    if (el.type !== "way" || !el.tags?.building) continue;
    const poly = ring(el);
    if (poly.length < 3) continue;
    if (containsPoint(poly, origin.lat, origin.lng)) continue;
    const xs = poly.map((p) => (p.lon - origin.lng) * METERS_PER_DEG_LNG * Math.cos((origin.lat * Math.PI) / 180));
    const zs = poly.map((p) => -(p.lat - origin.lat) * METERS_PER_DEG_LAT);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const x = (minX + maxX) / 2, z = (minZ + maxZ) / 2;
    const dist = Math.hypot(x, z);
    const w = maxX - minX, d = maxZ - minZ;
    if (dist > CONTEXT_RADIUS_M || w < 2 || d < 2) continue;
    const { h, height_status } = heightOf(el.tags);
    items.push({
      x: round1(x), z: round1(z), w: round1(w), d: round1(d), h, dist,
      source: `OpenStreetMap way ${el.id ?? "unknown"}`,
      height_status,
    });
  }
  return items
    .sort((a, b) => a.dist - b.dist)
    .slice(0, MAX_CONTEXT)
    .map(({ x, z, w, d, h, source, height_status }) => ({ x, z, w, d, h, source, height_status }));
}

const CACHE_COLLECTION = "viewer-geo";
const cacheEntrySchema = z.object({
  at: z.number(),
  items: z.array(
    z.object({ x: z.number(), z: z.number(), w: z.number(), d: z.number(), h: z.number(), source: z.string(), height_status: z.string() }),
  ),
});

/** Cache key rounded to about 11 m, so nearby geocodes share one Overpass answer. */
export function cacheKey(origin: LatLng): string {
  return `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}`;
}

/**
 * Buildings within CONTEXT_RADIUS_M of the point. Never throws: a failure returns [] with
 * "not retrieved". Results are cached for 24 h per coordinate in the shared store; a store
 * failure only skips the cache.
 */
export async function fetchContext(origin: LatLng, now = Date.now()): Promise<{ items: ContextItem[]; status: "retrieved" | "not retrieved" }> {
  const key = createHash("sha256").update(cacheKey(origin)).digest("hex").slice(0, 40);
  const hit = await readRecord(CACHE_COLLECTION, key, cacheEntrySchema).catch(() => null);
  if (hit && now - hit.at < CACHE_TTL_MS) return { items: hit.items, status: "retrieved" };
  const query = `[out:json][timeout:${OVERPASS_TIMEOUT_S}];way(around:${CONTEXT_RADIUS_M},${origin.lat},${origin.lng})["building"];out tags geom;`;
  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(OVERPASS_TIMEOUT_S * 1000 + 2000),
      cache: "no-store",
    });
    if (!res.ok) return { items: [], status: "not retrieved" };
    const data = (await res.json()) as { elements?: OsmElement[] };
    const items = toContext(data.elements ?? [], origin);
    await writeRecord(CACHE_COLLECTION, key, { at: now, items }).catch(() => undefined);
    return { items, status: "retrieved" };
  } catch {
    return { items: [], status: "not retrieved" };
  }
}
