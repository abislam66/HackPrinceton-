/*
 * Who may use the internal app. Pure functions, so the rules are tested without a request or Supabase.
 *
 * - AUTH_REQUIRED=true turns sign-in on. Without it nothing changes, so merging this is safe and the switch is
 *   flipped on the host (Vercel) when the Supabase and Google settings are ready.
 * - Everything is behind sign-in except what a client must be able to open: their proposal page, the tracking beacon
 *   it sends, the GLB it loads, and the sign-in pages themselves.
 * - Signed in means a Google account. Supabase also allows email sign-up, which anyone could use against the project
 *   directly, so a session from any other provider is refused.
 * - ALLOWED_EMAILS (comma separated) optionally narrows that to named people. Unset means any Google account.
 */

export type Claims = { email?: string; app_metadata?: { provider?: string } } | null;

export type Decision =
  | { action: "allow" }
  /** A page: send the person to sign in, then back to `next`. */
  | { action: "login"; next: string; error?: "not-allowed" }
  /** An API route: answer 401 instead of redirecting. */
  | { action: "unauthorized" };

type Env = Record<string, string | undefined>;

/** True when sign-in is switched on and Supabase is configured to do it. */
export function authRequired(env: Env = process.env): boolean {
  return (
    env.AUTH_REQUIRED === "true" && Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  );
}

/** The emails in ALLOWED_EMAILS, lower case. Empty means no limit beyond "a Google account". */
export function allowedEmails(env: Env = process.env): string[] {
  return (env.ALLOWED_EMAILS ?? "")
    .split(/[,\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** A Google sign-in, and on the allowlist when there is one. */
export function isAllowedUser(claims: Claims, allowed: string[] = allowedEmails()): boolean {
  if (!claims || claims.app_metadata?.provider !== "google") return false;
  if (allowed.length === 0) return true;
  return typeof claims.email === "string" && allowed.includes(claims.email.toLowerCase());
}

/** Pages and routes a signed-out visitor may open: the client's proposal, its beacon and model, and sign-in itself. */
export function isPublicRequest(pathname: string, method: string): boolean {
  if (pathname === "/login" || pathname === "/login/") return true;
  if (pathname.startsWith("/auth/")) return true;
  // /proposals/<client> is the client's page. /proposals/<client>/shots is the internal shot preview.
  if (/^\/proposals\/[^/]+\/?$/.test(pathname)) return true;
  if (pathname === "/api/track") return true;
  // The proposal page loads a generated building's model from here.
  if (/^\/api\/models\/[^/]+\/glb$/.test(pathname) && (method === "GET" || method === "HEAD")) return true;
  return false;
}

/** Where to send someone after sign-in: a path on this site, never another origin or a sign-in loop. */
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  let url: URL;
  try {
    url = new URL(value, "http://site.invalid");
  } catch {
    return "/";
  }
  if (url.origin !== "http://site.invalid") return "/";
  if (url.pathname === "/login" || url.pathname.startsWith("/auth/")) return "/";
  return `${url.pathname}${url.search}`;
}

/** What to do with a request. `required` is `authRequired()`; claims come from the session cookie, null when signed out. */
export function decide(input: { pathname: string; search?: string; method: string; claims: Claims; required: boolean }): Decision {
  const { pathname, search = "", method, claims, required } = input;
  if (!required || isPublicRequest(pathname, method)) return { action: "allow" };
  if (isAllowedUser(claims)) return { action: "allow" };
  if (pathname.startsWith("/api/")) return { action: "unauthorized" };
  // A session that isn't allowed (an email sign-up, or a Google account off the allowlist) is told why.
  return { action: "login", next: safeNext(`${pathname}${search}`), ...(claims ? { error: "not-allowed" as const } : {}) };
}
