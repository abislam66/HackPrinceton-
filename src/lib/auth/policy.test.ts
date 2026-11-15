import { describe, expect, it } from "vitest";
import { allowedEmails, authRequired, decide, isAllowedUser, isPublicRequest, safeNext } from "./policy";

const google = (email = "a@example.com") => ({ email, app_metadata: { provider: "google" } });
const emailSignup = { email: "a@example.com", app_metadata: { provider: "email" } };

describe("authRequired", () => {
  const supabase = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k" };
  it("is off unless AUTH_REQUIRED is exactly true", () => {
    expect(authRequired({ ...supabase })).toBe(false);
    expect(authRequired({ ...supabase, AUTH_REQUIRED: "false" })).toBe(false);
    expect(authRequired({ ...supabase, AUTH_REQUIRED: "1" })).toBe(false);
    expect(authRequired({ ...supabase, AUTH_REQUIRED: "true" })).toBe(true);
  });
  it("stays off when Supabase isn't configured, so the app can't lock itself out", () => {
    expect(authRequired({ AUTH_REQUIRED: "true" })).toBe(false);
    expect(authRequired({ AUTH_REQUIRED: "true", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" })).toBe(false);
  });
});

describe("allowedEmails / isAllowedUser", () => {
  it("reads a comma or space separated list, lower case", () => {
    expect(allowedEmails({ ALLOWED_EMAILS: " A@x.com, b@x.com  C@x.com " })).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    expect(allowedEmails({})).toEqual([]);
  });
  it("lets any Google account in when there is no allowlist", () => {
    expect(isAllowedUser(google("anyone@gmail.com"), [])).toBe(true);
  });
  it("refuses a session that did not come from Google, even with a verified email", () => {
    expect(isAllowedUser(emailSignup, [])).toBe(false);
    expect(isAllowedUser({ email: "a@x.com" }, [])).toBe(false);
    expect(isAllowedUser({ email: "a@x.com", app_metadata: {} }, [])).toBe(false);
  });
  it("refuses a signed-out visitor", () => {
    expect(isAllowedUser(null, [])).toBe(false);
  });
  it("with an allowlist, admits only listed emails, ignoring case", () => {
    expect(isAllowedUser(google("Me@X.com"), ["me@x.com"])).toBe(true);
    expect(isAllowedUser(google("other@x.com"), ["me@x.com"])).toBe(false);
    expect(isAllowedUser({ app_metadata: { provider: "google" } }, ["me@x.com"])).toBe(false);
  });
});

describe("isPublicRequest", () => {
  it("opens the sign-in pages", () => {
    for (const p of ["/login", "/login/", "/auth/signin", "/auth/callback", "/auth/signout"]) expect(isPublicRequest(p, "GET")).toBe(true);
  });
  it("opens the client's proposal page but not the internal shot preview", () => {
    expect(isPublicRequest("/proposals/acme", "GET")).toBe(true);
    expect(isPublicRequest("/proposals/acme/", "GET")).toBe(true);
    expect(isPublicRequest("/proposals/acme/shots", "GET")).toBe(false);
    expect(isPublicRequest("/proposals", "GET")).toBe(false);
  });
  it("opens the tracking beacon and the model GLB read, and nothing else under /api", () => {
    expect(isPublicRequest("/api/track", "POST")).toBe(true);
    expect(isPublicRequest("/api/models/8-carlisle/glb", "GET")).toBe(true);
    expect(isPublicRequest("/api/models/8-carlisle/glb", "POST")).toBe(false);
    expect(isPublicRequest("/api/models/8-carlisle/other", "GET")).toBe(false);
    for (const p of ["/api/agent", "/api/building-viewer/generate", "/api/proposals/acme/generate", "/api/outreach", "/api/scout/runs", "/api/tracking"]) {
      expect(isPublicRequest(p, "POST")).toBe(false);
    }
  });
  it("keeps the internal app closed", () => {
    for (const p of ["/", "/discover", "/projects", "/projects/x/stakeholders/y", "/building-viewer", "/outreach", "/agent", "/kit"]) {
      expect(isPublicRequest(p, "GET")).toBe(false);
    }
  });
  it("does not treat look-alike paths as sign-in pages", () => {
    expect(isPublicRequest("/login-admin", "GET")).toBe(false);
    expect(isPublicRequest("/authx/signin", "GET")).toBe(false);
  });
});

describe("safeNext", () => {
  it("keeps paths on this site, with their query", () => {
    expect(safeNext("/projects/x?tab=shots")).toBe("/projects/x?tab=shots");
    expect(safeNext("/")).toBe("/");
  });
  it("falls back to / for anything that could leave the site or loop", () => {
    for (const bad of [null, undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "/login", "/auth/callback?x=1"]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});

describe("decide", () => {
  const base = { method: "GET", required: true };
  it("allows everything when sign-in is off", () => {
    expect(decide({ ...base, required: false, pathname: "/discover", claims: null })).toEqual({ action: "allow" });
  });
  it("allows public requests without a session", () => {
    expect(decide({ ...base, pathname: "/proposals/acme", claims: null })).toEqual({ action: "allow" });
  });
  it("sends a signed-out visitor to sign in and back to the page they asked for", () => {
    expect(decide({ ...base, pathname: "/projects/x", search: "?tab=shots", claims: null })).toEqual({ action: "login", next: "/projects/x?tab=shots" });
  });
  it("answers 401 to a signed-out API call instead of redirecting", () => {
    expect(decide({ ...base, method: "POST", pathname: "/api/building-viewer/generate", claims: null })).toEqual({ action: "unauthorized" });
  });
  it("lets a Google user through pages and APIs", () => {
    expect(decide({ ...base, pathname: "/discover", claims: google() })).toEqual({ action: "allow" });
    expect(decide({ ...base, method: "POST", pathname: "/api/agent", claims: google() })).toEqual({ action: "allow" });
  });
  it("turns away a session that is not a Google sign-in, with the reason", () => {
    expect(decide({ ...base, pathname: "/discover", claims: emailSignup })).toEqual({ action: "login", next: "/discover", error: "not-allowed" });
    expect(decide({ ...base, method: "POST", pathname: "/api/agent", claims: emailSignup })).toEqual({ action: "unauthorized" });
  });
});
