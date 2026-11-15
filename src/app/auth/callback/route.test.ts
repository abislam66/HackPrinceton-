import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEXT_COOKIE } from "@/lib/auth/session-cookie";

const { supabase, jar } = vi.hoisted(() => ({
  supabase: {
    exchangeError: null as string | null,
    user: null as { email?: string; app_metadata?: { provider?: string } } | null,
    calls: [] as string[],
  },
  jar: { next: undefined as string | undefined },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "tm_auth_next" && jar.next ? { name, value: jar.next } : undefined) }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: async (code: string) => {
        supabase.calls.push(`exchange:${code}`);
        return { error: supabase.exchangeError ? { message: supabase.exchangeError } : null };
      },
      getUser: async () => ({ data: { user: supabase.user } }),
      signOut: async (opts: { scope: string }) => {
        supabase.calls.push(`signOut:${opts.scope}`);
        return { error: null };
      },
    },
  }),
}));

const { GET } = await import("./route");
const call = (query: string) => GET(new Request(`https://app.example/auth/callback${query}`));
const location = (res: Response) => new URL(res.headers.get("location")!);
const google = (email: string) => ({ email, app_metadata: { provider: "google" } });

describe("GET /auth/callback", () => {
  beforeEach(() => {
    supabase.exchangeError = null;
    supabase.user = google("someone@gmail.com");
    supabase.calls.length = 0;
    jar.next = undefined;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("signs a Google account in and goes to the page they were heading for", async () => {
    jar.next = "/projects/8-carlisle-new-york";
    const res = await call("?code=abc");
    expect(res.status).toBe(307);
    expect(location(res).pathname).toBe("/projects/8-carlisle-new-york");
    expect(supabase.calls).toEqual(["exchange:abc"]);
  });

  it("lands on / when nothing was remembered, or the remembered address could leave the site", async () => {
    expect(location(await call("?code=abc")).pathname).toBe("/");
    jar.next = "https://evil.example/steal";
    const res = await call("?code=abc");
    expect(location(res).origin).toBe("https://app.example");
    expect(location(res).pathname).toBe("/");
  });

  it("signs out and refuses an account that did not sign in with Google", async () => {
    supabase.user = { email: "someone@gmail.com", app_metadata: { provider: "email" } };
    const res = await call("?code=abc");
    expect(location(res).pathname).toBe("/login");
    expect(location(res).searchParams.get("error")).toBe("not-allowed");
    expect(supabase.calls).toEqual(["exchange:abc", "signOut:local"]);
  });

  it("signs out and refuses a Google account that is not on ALLOWED_EMAILS", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "me@x.com, you@x.com");
    supabase.user = google("stranger@gmail.com");
    const res = await call("?code=abc");
    expect(location(res).searchParams.get("error")).toBe("not-allowed");
    expect(supabase.calls).toContain("signOut:local");
  });

  it("admits a Google account that is on ALLOWED_EMAILS, ignoring case", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "me@x.com");
    supabase.user = google("Me@X.com");
    const res = await call("?code=abc");
    expect(location(res).pathname).toBe("/");
    expect(supabase.calls).not.toContain("signOut:local");
  });

  it("goes back to sign-in without calling Supabase when Google or Supabase reported an error, or sent no code", async () => {
    for (const query of ["?error=access_denied&error_code=bad", ""]) {
      const res = await call(query);
      expect(location(res).pathname).toBe("/login");
      expect(location(res).searchParams.get("error")).toBe("failed");
    }
    expect(supabase.calls).toEqual([]);
  });

  it("goes back to sign-in when the code can't be exchanged", async () => {
    supabase.exchangeError = "code expired";
    const res = await call("?code=old");
    expect(location(res).searchParams.get("error")).toBe("failed");
    expect(supabase.calls).toEqual(["exchange:old"]);
  });

  it("clears the remembered destination on every exit", async () => {
    jar.next = "/discover";
    for (const query of ["?code=abc", "?error=x"]) {
      const res = await call(query);
      expect(res.headers.get("set-cookie") ?? "").toContain(`${NEXT_COOKIE}=;`);
    }
  });
});
