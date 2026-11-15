/*
 * Map facts for the viewer, fetched by the backend only. The model never fetches map data.
 * Coordinates are metres from the geocoded point (the subject), x east, z south (the scaffold's
 * convention is +x east and +z toward the viewer; here z = -north so it matches model-builder).
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { readRecord, writeRecord } from "@/lib/store/json-store";

/** Same reach as the demo model's surroundings (model-builder massing.py CONTEXT_RADIUS_M). */
export const CONTEXT_RADIUS_M = 220;
export const MAX_CONTEXT = 100;
export const MAX_STREETS = 60;
/** Points kept per street centreline. */
export const MAX_STREET_POINTS = 64;
/**
 * Overpass's own query limit. A dense block (lower Manhattan) takes about 30 s on overpass-api.de, so the old 15 s
 * limit (and its 17 s abort) failed every time there. The context fetch runs alongside the model call, which takes
 * minutes, so waiting longer costs the run nothing.
 */
export const OVERPASS_TIMEOUT_S = 60;
/** Neighbours change slowly; a week saves a slow Overpass call on every regeneration. */
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Points kept per neighbour outline. */
export const MAX_FOOTPRINT_POINTS = 32;
export const LEVEL_HEIGHT_M = 4.2;
export const DEFAULT_HEIGHT_M = 12;
const USER_AGENT = "HackPrinceton-building-viewer/0.1 (hackathon demo)";
const MAIN_OVERPASS = "https://overpass-api.de/api/interpreter";
const MIRROR_OVERPASS = "https://overpass.private.coffee/api/interpreter";
/**
 * Which server each attempt asks. The main instance is busy rather than down: it often answers an instant 502, then
 * 200 a few seconds later. The mirror is tried, with a shorter timeout, in case the main one is out for longer.
 */
const ATTEMPTS = [MAIN_OVERPASS, MIRROR_OVERPASS, MAIN_OVERPASS, MAIN_OVERPASS, MIRROR_OVERPASS, MAIN_OVERPASS, MAIN_OVERPASS];
/** Wait before each attempt, ms (index = attempt). Later attempts reuse the last value. */
const BACKOFF_MS = [0, 0, 3_000, 6_000, 10_000, 15_000];
const MIRROR_TIMEOUT_MS = 30_000;
/** How long the lookup may keep trying by default. The generator passes its own deadline. */
export const CONTEXT_BUDGET_MS = 150_000;
/** Street widths by OpenStreetMap highway class, metres. Classes not listed (footways, tracks) are left out. */
export const STREET_WIDTH_M: Record<string, number> = {
  motorway: 22, trunk: 18, primary: 16, secondary: 14, tertiary: 12,
  unclassified: 10, residential: 9, living_street: 7, pedestrian: 7, service: 5,
};
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
  /** The building's outline as [x, z] points in the same frame, when OpenStreetMap has one. */
  footprint?: [number, number][];
};

/** A street centreline as [x, z] points in the same frame as ContextItem, with its width. */
export type StreetItem = { line: [number, number][]; widthM: number; name?: string };

export type LatLng = { lat: number; lng: number };

/** Geocoding result: the point, or null with the reason shown to the model and the user. */
export type GeocodeResult = { point: LatLng; status: "retrieved" } | { point: null; status: "not retrieved" };

/** Google Geocoding. Never throws; a failure returns "not retrieved" so the run can continue. */
export async function geocodeAddress(address: string, key: string | undefined): Promise<GeocodeResult> {
  if (!key) return { point: null, status: "not retrieved" };
  try {
    const url = new URL(GEOCODE_URL);
    url.searchParams.set("address", address);
    url.searchParams.set("key", key);
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!res.ok) return { point: null, status: "not retrieved" };
    const data = (await res.json()) as { status?: string; results?: { geometry?: { location?: LatLng } }[] };
    const loc = data.results?.[0]?.geometry?.location;
    if (data.status !== "OK" || !loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
      return { point: null, status: "not retrieved" };
    }
    return { point: { lat: loc.lat, lng: loc.lng }, status: "retrieved" };
  } catch {
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

/** A geocoded point this close to a building's centre is taken to be that building when it falls in none. */
export const SUBJECT_SNAP_M = 25;

/**
 * Turn Overpass building ways into context items around the subject building.
 *
 * The subject is the way the geocoded point falls in (the smallest, when several do), else the way whose centre is
 * within SUBJECT_SNAP_M of it. The items are placed relative to the subject's centre, not to the geocoded point
 * (an entrance or street-frontage point can sit 10-30 m off), because the generated model puts the building's
 * footprint centre at the origin. With no subject found, the geocoded point is the origin.
 * Drops the subject, anything beyond the radius, and degenerate outlines. Nearest first, capped at MAX_CONTEXT.
 */
export function toContext(elements: OsmElement[], origin: LatLng): ContextItem[] {
  return toSurroundings(elements, origin).items;
}

/** The neighbours (as toContext) and the streets around the subject, in the same frame. */
export function toSurroundings(elements: OsmElement[], origin: LatLng): { items: ContextItem[]; streets: StreetItem[] } {
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  type Shape = { el: OsmElement; xs: number[]; zs: number[]; x: number; z: number; w: number; d: number; inside: boolean };
  const shapes: Shape[] = [];
  for (const el of elements) {
    if (el.type !== "way" || !el.tags?.building) continue;
    const poly = ring(el);
    if (poly.length < 3) continue;
    const xs = poly.map((p) => (p.lon - origin.lng) * METERS_PER_DEG_LNG * cosLat);
    const zs = poly.map((p) => -(p.lat - origin.lat) * METERS_PER_DEG_LAT);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    shapes.push({
      el, xs, zs,
      x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ,
      inside: containsPoint(poly, origin.lat, origin.lng),
    });
  }

  const containing = shapes.filter((s) => s.inside).sort((a, b) => a.w * a.d - b.w * b.d)[0];
  const nearest = shapes
    .filter((s) => Math.hypot(s.x, s.z) <= SUBJECT_SNAP_M)
    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
  const subject = containing ?? nearest ?? null;
  const ax = subject?.x ?? 0, az = subject?.z ?? 0;

  const items: (ContextItem & { dist: number })[] = [];
  for (const shape of shapes) {
    if (shape === subject || shape.inside) continue;
    const x = shape.x - ax, z = shape.z - az;
    const dist = Math.hypot(x, z);
    if (dist > CONTEXT_RADIUS_M || shape.w < 2 || shape.d < 2) continue;
    const { h, height_status } = heightOf(shape.el.tags ?? {});
    const footprint = outline(shape.xs.map((v) => v - ax), shape.zs.map((v) => v - az));
    items.push({
      x: round1(x), z: round1(z), w: round1(shape.w), d: round1(shape.d), h, dist,
      source: `OpenStreetMap way ${shape.el.id ?? "unknown"}`,
      height_status,
      ...(footprint ? { footprint } : {}),
    });
  }
  items.sort((a, b) => a.dist - b.dist);

  const streets: (StreetItem & { dist: number })[] = [];
  for (const el of elements) {
    const width = el.type === "way" && !el.tags?.building ? STREET_WIDTH_M[el.tags?.highway ?? ""] : undefined;
    if (!width) continue;
    const line = ring(el)
      .map((p) => [round1((p.lon - origin.lng) * METERS_PER_DEG_LNG * cosLat - ax), round1(-(p.lat - origin.lat) * METERS_PER_DEG_LAT - az)] as [number, number])
      .filter(([x, z]) => Math.hypot(x, z) <= CONTEXT_RADIUS_M + 20);
    if (line.length < 2) continue;
    const thinned = line.length > MAX_STREET_POINTS ? Array.from({ length: MAX_STREET_POINTS }, (_, i) => line[Math.round((i * (line.length - 1)) / (MAX_STREET_POINTS - 1))]) : line;
    const dist = Math.min(...thinned.map(([x, z]) => Math.hypot(x, z)));
    streets.push({ line: thinned, widthM: width, ...(el.tags?.name ? { name: el.tags.name.slice(0, 80) } : {}), dist });
  }
  // Roads first, nearest first; paths and service lanes only fill what is left of MAX_STREETS.
  const minor = (street: StreetItem) => street.widthM <= STREET_WIDTH_M.pedestrian;
  streets.sort((a, b) => Number(minor(a)) - Number(minor(b)) || a.dist - b.dist);

  return {
    items: items.slice(0, MAX_CONTEXT).map((item) => {
      const { x, z, w, d, h, source, height_status, footprint } = item;
      return { x, z, w, d, h, source, height_status, ...(footprint ? { footprint } : {}) };
    }),
    streets: streets.slice(0, MAX_STREETS).map(({ line, widthM, name }) => ({ line, widthM, ...(name ? { name } : {}) })),
  };
}

/** The outline in metres, closing point dropped, thinned to MAX_FOOTPRINT_POINTS. Null when it is degenerate. */
function outline(xs: number[], zs: number[]): [number, number][] | null {
  let points = xs.map((x, i) => [round1(x), round1(zs[i])] as [number, number]);
  const [first, last] = [points[0], points[points.length - 1]];
  if (points.length > 1 && first[0] === last[0] && first[1] === last[1]) points = points.slice(0, -1);
  if (points.length > MAX_FOOTPRINT_POINTS) {
    const stride = points.length / MAX_FOOTPRINT_POINTS;
    points = Array.from({ length: MAX_FOOTPRINT_POINTS }, (_, i) => points[Math.floor(i * stride)]);
  }
  return points.length >= 3 ? points : null;
}

/** v2: 220 m, with streets. Entries from the 150 m buildings-only lookup are not reused. */
const CACHE_COLLECTION = "viewer-geo-v2";
const cacheEntrySchema = z.object({
  at: z.number(),
  items: z.array(
    z.object({
      x: z.number(),
      z: z.number(),
      w: z.number(),
      d: z.number(),
      h: z.number(),
      source: z.string(),
      height_status: z.string(),
      footprint: z.array(z.tuple([z.number(), z.number()])).optional(),
    }),
  ),
  streets: z.array(z.object({ line: z.array(z.tuple([z.number(), z.number()])), widthM: z.number(), name: z.string().optional() })),
});

/** Cache key rounded to about 11 m, so nearby geocodes share one Overpass answer. */
export function cacheKey(origin: LatLng): string {
  return `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}`;
}

export type Surroundings = { items: ContextItem[]; streets: StreetItem[]; status: "retrieved" | "not retrieved" };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Buildings and streets within CONTEXT_RADIUS_M of the point. Never throws: a failure returns none with
 * "not retrieved". Overpass is often busy, so it is asked again (with growing waits) until `deadline`; each failure
 * is logged with its reason (status or error name; never the coordinates). Results are cached per coordinate in the
 * shared store; a store failure only skips the cache.
 */
export async function fetchContext(origin: LatLng, now = Date.now(), deadline = Date.now() + CONTEXT_BUDGET_MS): Promise<Surroundings> {
  const key = createHash("sha256").update(cacheKey(origin)).digest("hex").slice(0, 40);
  const hit = await readRecord(CACHE_COLLECTION, key, cacheEntrySchema).catch(() => null);
  if (hit && now - hit.at < CACHE_TTL_MS) return { items: hit.items, streets: hit.streets, status: "retrieved" };
  const around = `(around:${CONTEXT_RADIUS_M},${origin.lat},${origin.lng})`;
  const highways = Object.keys(STREET_WIDTH_M).join("|");
  const query = `[out:json][timeout:${OVERPASS_TIMEOUT_S}];(way${around}["building"];way${around}["highway"~"^(${highways})$"];);out tags geom;`;
  for (let attempt = 0; ; attempt++) {
    const pause = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    if (Date.now() + pause + 5_000 > deadline) break;
    if (pause) await wait(pause);
    const url = ATTEMPTS[attempt % ATTEMPTS.length];
    const host = new URL(url).host;
    const started = Date.now();
    const limit = Math.min(url === MIRROR_OVERPASS ? MIRROR_TIMEOUT_MS : OVERPASS_TIMEOUT_S * 1000 + 5000, deadline - Date.now());
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(limit),
        cache: "no-store",
      });
      if (!res.ok) {
        console.warn(`building-viewer context: ${host} answered HTTP ${res.status} after ${Date.now() - started} ms (attempt ${attempt + 1})`);
        continue;
      }
      const data = (await res.json()) as { elements?: OsmElement[]; remark?: string };
      // Overpass reports its own timeouts as a 200 with a remark and no elements.
      if (data.remark && !data.elements?.length) {
        console.warn(`building-viewer context: ${host} remark: ${data.remark.slice(0, 200)} (attempt ${attempt + 1})`);
        continue;
      }
      const { items, streets } = toSurroundings(data.elements ?? [], origin);
      await writeRecord(CACHE_COLLECTION, key, { at: now, items, streets }).catch(() => undefined);
      console.info(`building-viewer context: ${host} gave ${items.length} buildings, ${streets.length} streets (attempt ${attempt + 1})`);
      return { items, streets, status: "retrieved" };
    } catch (error) {
      console.warn(`building-viewer context: ${host} failed (${(error as Error).name}) after ${Date.now() - started} ms (attempt ${attempt + 1})`);
    }
  }
  return { items: [], streets: [], status: "not retrieved" };
}
