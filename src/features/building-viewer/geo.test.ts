import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store/json-store", () => import("@/lib/store/test-store"));

import { clearMemoryStore } from "@/lib/store/test-store";
import { CACHE_TTL_MS, fetchContext, MAX_FOOTPRINT_POINTS, toContext, toSurroundings } from "./geo";

const origin = { lat: 39.978, lng: -75.1577 };

/** A way north-east of the origin: `points` around a circle of about 10 m, optionally closed. */
function circleWay(id: number, points: number, closed: boolean) {
  const centre = { lat: origin.lat + 0.0005, lon: origin.lng + 0.0005 };
  const geometry = Array.from({ length: points }, (_, i) => {
    const a = (i / points) * 2 * Math.PI;
    return { lat: centre.lat + 0.0001 * Math.sin(a), lon: centre.lon + 0.00013 * Math.cos(a) };
  });
  if (closed) geometry.push({ ...geometry[0] });
  return { type: "way", id, tags: { building: "yes" }, geometry };
}

describe("toContext footprints", () => {
  it("keeps the outline in metres with the closing point dropped", () => {
    const [item] = toContext([circleWay(1, 6, true)], origin);
    expect(item.footprint).toHaveLength(6);
    const [first, last] = [item.footprint![0], item.footprint![5]];
    expect(first).not.toEqual(last);
    // East of the origin is +x, north is -z; the outline sits around the item's centre.
    for (const [x, z] of item.footprint!) {
      expect(x).toBeGreaterThan(0);
      expect(z).toBeLessThan(0);
      expect(Math.abs(x - item.x)).toBeLessThanOrEqual(item.w / 2 + 0.1);
      expect(Math.abs(z - item.z)).toBeLessThanOrEqual(item.d / 2 + 0.1);
    }
  });

  it("keeps an open outline as given", () => {
    const [item] = toContext([circleWay(1, 5, false)], origin);
    expect(item.footprint).toHaveLength(5);
  });

  it("thins a long outline to MAX_FOOTPRINT_POINTS, starting at its first point", () => {
    const [full] = toContext([circleWay(1, 80, true)], origin);
    expect(MAX_FOOTPRINT_POINTS).toBe(32);
    expect(full.footprint).toHaveLength(32);
    const [unthinned] = toContext([circleWay(1, 20, true)], origin);
    expect(full.footprint![0]).toEqual(unthinned.footprint![0]);
  });
});

/** A square way of `half` degrees around a centre offset from the origin. */
function squareWay(id: number, dLat: number, dLng: number, half = 0.0001) {
  const c = { lat: origin.lat + dLat, lon: origin.lng + dLng };
  const geometry = [
    { lat: c.lat - half, lon: c.lon - half },
    { lat: c.lat - half, lon: c.lon + half },
    { lat: c.lat + half, lon: c.lon + half },
    { lat: c.lat + half, lon: c.lon - half },
  ];
  return { type: "way", id, tags: { building: "yes" }, geometry };
}

describe("toContext anchoring on the subject building", () => {
  it("places neighbours relative to the building the point falls in, not the point itself", () => {
    // The geocoded point sits near the south-west corner of its building, about 9 m from its centre.
    const subject = squareWay(1, 0.00007, 0.00007);
    const neighbour = squareWay(2, 0.00007, 0.00107); // 0.001 deg east of the subject's centre
    const [item] = toContext([subject, neighbour], origin);
    expect(item.source).toBe("OpenStreetMap way 2");
    expect(item.z).toBeCloseTo(0, 0); // level with the subject's centre, though 7.7 m north of the point
    expect(item.x).toBeGreaterThan(80);
    expect(item.x).toBeLessThan(90);
  });

  it("snaps to a building whose centre is within SUBJECT_SNAP_M when the point falls in none, and drops it", () => {
    const near = squareWay(1, 0.00015, 0, 0.00005); // centre about 17 m north, point outside it
    const far = squareWay(2, 0.00015, 0.001);
    const items = toContext([near, far], origin);
    expect(items.map((i) => i.source)).toEqual(["OpenStreetMap way 2"]);
    expect(items[0].z).toBeCloseTo(0, 0);
  });
});

/** An Overpass answer with one neighbour. */
const ANSWER = { elements: [circleWay(7, 8, true)] };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("toSurroundings streets", () => {
  it("keeps drivable streets with their class width and name, in the subject's frame, and skips footways", () => {
    const line = (id: number, highway: string, name?: string) => ({
      type: "way",
      id,
      tags: { highway, ...(name ? { name } : {}) },
      geometry: [
        { lat: origin.lat - 0.0005, lon: origin.lng - 0.001 },
        { lat: origin.lat - 0.0005, lon: origin.lng + 0.001 },
      ],
    });
    const { items, streets } = toSurroundings([line(1, "primary", "Broad Street"), line(2, "footway"), line(3, "residential")], origin);
    expect(items).toEqual([]);
    expect(streets.map((s) => [s.widthM, s.name])).toEqual([
      [16, "Broad Street"],
      [9, undefined],
    ]);
    // 0.0005 deg south of the point: +z, about 55 m.
    expect(streets[0].line[0][1]).toBeCloseTo(55.3, 0);
  });
});

describe("fetchContext", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearMemoryStore();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    warn.mockRestore();
  });

  const hosts = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)).host);

  it("uses the main instance when it answers", async () => {
    fetchMock.mockResolvedValueOnce(json(ANSWER));
    const result = await fetchContext(origin);
    expect(result.status).toBe("retrieved");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].source).toBe("OpenStreetMap way 7");
    expect(hosts()).toEqual(["overpass-api.de"]);
    const body = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get("data")).toContain("[timeout:60]");
  });

  it("falls back to the mirror on an HTTP error, and logs the status without the coordinates", async () => {
    fetchMock.mockResolvedValueOnce(new Response("busy", { status: 504 })).mockResolvedValueOnce(json(ANSWER));
    const result = await fetchContext(origin);
    expect(result.status).toBe("retrieved");
    expect(result.items).toHaveLength(1);
    expect(hosts()).toEqual(["overpass-api.de", "overpass.private.coffee"]);
    expect(warn).toHaveBeenCalledOnce();
    const line = String(warn.mock.calls[0][0]);
    expect(line).toMatch(/overpass-api\.de answered HTTP 504/);
    expect(line).not.toContain(String(origin.lat));
  });

  it("falls back to the mirror when Overpass answers with a timeout remark and no elements", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ elements: [], remark: "runtime error: Query timed out in \"query\" at line 1" }))
      .mockResolvedValueOnce(json(ANSWER));
    const result = await fetchContext(origin);
    expect(result.items).toHaveLength(1);
    expect(hosts()).toEqual(["overpass-api.de", "overpass.private.coffee"]);
    expect(String(warn.mock.calls[0][0])).toMatch(/overpass-api\.de remark: runtime error/);
  });

  /** A deadline that allows the two immediate attempts and no waited retry. */
  const soon = () => Date.now() + 6_000;

  it("returns nothing, without throwing, when both instances fail before the deadline, and logs each", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(new Response("", { status: 429 }));
    await expect(fetchContext(origin, Date.now(), soon())).resolves.toEqual({ items: [], streets: [], status: "not retrieved" });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toMatch(/overpass-api\.de failed \(TypeError\)/);
    expect(String(warn.mock.calls[1][0])).toMatch(/overpass\.private\.coffee answered HTTP 429/);
  });

  it("serves a cached answer for a week, then fetches again", async () => {
    const now = 1_800_000_000_000;
    fetchMock.mockImplementation(async () => json(ANSWER));
    await fetchContext(origin, now);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // A geocode a metre away shares the cache entry.
    const cached = await fetchContext({ lat: origin.lat + 0.00001, lng: origin.lng }, now + CACHE_TTL_MS - 1);
    expect(cached.status).toBe("retrieved");
    expect(cached.items[0].footprint).toHaveLength(8);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fetchContext(origin, now + CACHE_TTL_MS + 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks the main instance again after a wait when it and the mirror are busy", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      fetchMock
        .mockResolvedValueOnce(new Response("", { status: 502 }))
        .mockRejectedValueOnce(Object.assign(new Error("timed out"), { name: "TimeoutError" }))
        .mockResolvedValueOnce(json(ANSWER));
      const pending = fetchContext(origin);
      await vi.advanceTimersByTimeAsync(3_000);
      const result = await pending;
      expect(result.status).toBe("retrieved");
      expect(hosts()).toEqual(["overpass-api.de", "overpass.private.coffee", "overpass-api.de"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not cache a failure", async () => {
    fetchMock.mockImplementation(async () => new Response("", { status: 503 }));
    await fetchContext(origin, Date.now(), soon());
    fetchMock.mockImplementation(async () => json(ANSWER));
    expect((await fetchContext(origin)).items).toHaveLength(1);
  });
});
