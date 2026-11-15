import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEXT_COOKIE } from "@/lib/auth/session-cookie";

const { oauth } = vi.hoisted(() => ({
  oauth: { url: "https://x.supabase.co/auth/v1/authorize?provider=google" as string | null, error: null as string | null, args: [] as unknown[] },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithOAuth: async (args: unknown) => {
        oauth.args.push(args);
        return { data: { url: oauth.url }, error: oauth.error ? { message: oauth.error } : null };
      },
    },
  }),
}));

const { GET } = await import("./route");
const call = (query = "") => GET(new Request(`https://app.example/auth/signin${query}`));

describe("GET /auth/signin", () => {
  beforeEach(() => {
    oauth.url = "https://x.supabase.co/auth/v1/authorize?provider=google";
    oauth.error = null;
    oauth.args.length = 0;
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pk");
    vi.stubEnv("AUTH_REQUIRED", "true");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("sends the browser to Google's URL from Supabase, asking for the account chooser and a bare callback URL", async () => {
    const res = await call("?next=/projects/x");
    expect(res.headers.get("location")).toBe("https://x.supabase.co/auth/v1/authorize?provider=google");
    expect(oauth.args[0]).toMatchObject({
      provider: "google",
      options: { redirectTo: "https://app.example/auth/callback", queryParams: { prompt: "select_account" } },
    });
  });

  it("remembers where to land in an HttpOnly cookie, and only on this site", async () => {
    const cookie = (await call("?next=/projects/x")).headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${NEXT_COOKIE}=%2Fprojects%2Fx`);
    expect(cookie.toLowerCase()).toContain("httponly");
    const evil = (await call("?next=https://evil.example")).headers.get("set-cookie") ?? "";
    expect(evil).toContain(`${NEXT_COOKIE}=%2F;`);
  });

  it("goes back to /login with a message when Supabase can't start the sign-in", async () => {
    oauth.error = "provider is not enabled";
    const res = await call();
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    expect(new URL(res.headers.get("location")!).searchParams.get("error")).toBe("failed");
  });

  it("just continues to the page when sign-in is switched off", async () => {
    vi.stubEnv("AUTH_REQUIRED", "");
    const res = await call("?next=/discover");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/discover");
    expect(oauth.args).toEqual([]);
  });
});
