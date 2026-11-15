import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ssr } = vi.hoisted(() => ({
  ssr: { claims: null as unknown, throwOnClaims: false, created: 0 },
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => {
    ssr.created += 1;
    return {
      auth: {
        getClaims: async () => {
          if (ssr.throwOnClaims) throw new Error("Supabase unreachable");
          return { data: ssr.claims ? { claims: ssr.claims } : null };
        },
      },
    };
  },
}));

const { proxy } = await import("./proxy");
const req = (path: string, method = "GET") => new NextRequest(`https://app.example${path}`, { method });
const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";
const google = { email: "a@gmail.com", app_metadata: { provider: "google" } };

describe("proxy", () => {
  beforeEach(() => {
    ssr.claims = null;
    ssr.throwOnClaims = false;
    ssr.created = 0;
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pk");
    vi.stubEnv("AUTH_REQUIRED", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("does nothing when sign-in is off", async () => {
    vi.stubEnv("AUTH_REQUIRED", "");
    expect(passes(await proxy(req("/discover")))).toBe(true);
    expect(ssr.created).toBe(0);
  });

  it("lets the client's proposal page, its beacon and the sign-in pages through without asking Supabase", async () => {
    for (const [path, method] of [["/proposals/acme", "GET"], ["/api/track", "POST"], ["/login", "GET"], ["/auth/callback", "GET"]] as const) {
      expect(passes(await proxy(req(path, method)))).toBe(true);
    }
    expect(ssr.created).toBe(0);
  });

  it("sends a signed-out visitor to /login, remembering the page and its query", async () => {
    const res = await proxy(req("/projects/x?tab=shots"));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("next")).toBe("/projects/x?tab=shots");
    expect(to.searchParams.get("error")).toBeNull();
  });

  it("answers a signed-out API call with 401 JSON, not a redirect", async () => {
    const res = await proxy(req("/api/building-viewer/generate", "POST"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in to use this." });
  });

  it("keeps the internal shot preview closed even though the proposal page is open", async () => {
    expect((await proxy(req("/proposals/acme/shots"))).status).toBe(307);
  });

  it("lets a Google sign-in through to pages and API routes", async () => {
    ssr.claims = google;
    expect(passes(await proxy(req("/discover")))).toBe(true);
    expect(passes(await proxy(req("/api/agent", "POST")))).toBe(true);
  });

  it("turns back a session that did not come from Google, and says why", async () => {
    ssr.claims = { email: "a@gmail.com", app_metadata: { provider: "email" } };
    const res = await proxy(req("/discover"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).searchParams.get("error")).toBe("not-allowed");
  });

  it("treats an unreachable Supabase as signed out, so the internal app closes instead of opening", async () => {
    ssr.throwOnClaims = true;
    expect((await proxy(req("/discover"))).status).toBe(307);
    expect((await proxy(req("/api/agent", "POST"))).status).toBe(401);
  });
});
