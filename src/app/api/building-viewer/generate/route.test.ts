import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/store/json-store", () => import("@/lib/store/test-store"));

// The generator itself is mocked: these tests check the route's order of checks, never a paid call.
vi.mock("@/features/building-viewer/generate", () => ({
  StepError: class StepError extends Error {
    constructor(public readonly step: string, message: string) {
      super(message);
    }
  },
  generateViewer: vi.fn(async () => ({
    type: "result",
    html: "<!DOCTYPE html>",
    reply: "ok",
    geocode_status: "retrieved",
    context_status: "retrieved",
    drift: false,
  })),
}));

import { POST } from "./route";

const CODE = "test-code";

function request(ip: string, fields: Record<string, string>, code: string | null = CODE) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  const headers = new Headers({ "x-forwarded-for": ip });
  if (code !== null) headers.set("x-access-code", code);
  return new Request("http://localhost/api/building-viewer/generate", { method: "POST", headers, body });
}

const GOOD = { address: "1601 N Broad St, Philadelphia, PA" };

describe("POST /api/building-viewer/generate rate limit", () => {
  beforeEach(() => vi.stubEnv("BUILDING_VIEWER_ACCESS_CODE", CODE));
  afterEach(() => vi.unstubAllEnvs());

  it("does not count requests rejected by the access code or the input checks", async () => {
    const ip = "203.0.113.10";
    for (let i = 0; i < 6; i++) {
      expect((await POST(request(ip, GOOD, "wrong"))).status).toBe(401);
      expect((await POST(request(ip, { address: "ab" }))).status).toBe(400);
    }
    // Twelve rejected requests later, the client still has all five runs.
    for (let i = 0; i < 5; i++) expect((await POST(request(ip, GOOD))).status).toBe(200);
  });

  it("refuses the sixth accepted run in the hour with 429 and Retry-After", async () => {
    const ip = "203.0.113.11";
    for (let i = 0; i < 5; i++) expect((await POST(request(ip, GOOD))).status).toBe(200);
    const sixth = await POST(request(ip, GOOD));
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toEqual({ error: "You've made 5 viewers in the last hour. Try again later.", step: "rate_limit" });
    expect(Number(sixth.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
