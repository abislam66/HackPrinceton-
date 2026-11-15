import { afterEach, describe, expect, it, vi } from "vitest";
import { geocodeAddress } from "./geo";

const KEY = "test-key-abc123";
const ADDRESS = "1601 N Broad St, Philadelphia, PA";

function respond(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

function logged(): string {
  const warn = vi.mocked(console.warn);
  return warn.mock.calls.map((c) => c.join(" ")).join("\n");
}

describe("geocode failure logging", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("says when no key is configured", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await geocodeAddress(ADDRESS, undefined)).toEqual({ point: null, status: "not retrieved" });
    expect(logged()).toContain("no key configured");
  });

  it("logs Google's status and error_message, never the key or the address", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    respond(200, { status: "REQUEST_DENIED", error_message: `This IP is not authorized to use this API key (${KEY}).`, results: [] });
    expect((await geocodeAddress(ADDRESS, KEY)).status).toBe("not retrieved");
    const text = logged();
    expect(text).toContain("status=REQUEST_DENIED");
    expect(text).toContain("This IP is not authorized");
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("Broad St");
    expect(text).not.toContain("maps.googleapis.com");
  });

  it("logs the HTTP status when Google doesn't answer with JSON", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    respond(503, {});
    await geocodeAddress(ADDRESS, KEY);
    expect(logged()).toContain("HTTP 503");
  });

  it("logs a failed request by its error name", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw Object.assign(new Error("x"), { name: "TimeoutError" }); }));
    await geocodeAddress(ADDRESS, KEY);
    expect(logged()).toContain("request failed (TimeoutError)");
  });

  it("logs nothing when the geocode succeeds", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    respond(200, { status: "OK", results: [{ geometry: { location: { lat: 39.98, lng: -75.16 } } }] });
    expect(await geocodeAddress(ADDRESS, KEY)).toEqual({ point: { lat: 39.98, lng: -75.16 }, status: "retrieved" });
    expect(logged()).toBe("");
  });
});
