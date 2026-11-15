import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authRequired, decide, isPublicRequest, type Claims } from "@/lib/auth/policy";

/*
 * Sign-in gate (docs: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
 *
 * Off unless AUTH_REQUIRED=true (src/lib/auth/policy.ts has the rules). When on, it refreshes the Supabase session
 * cookie, reads who is signed in from it, and sends everyone else to /login (pages) or answers 401 (API routes).
 * The client's proposal page, its tracking beacon and the sign-in pages are never gated, and skip the session lookup so
 * they work even if Supabase is slow. This is an early check, not the only one: routes that spend money or send email
 * check the session again (src/lib/auth/session.ts).
 */
export async function proxy(request: NextRequest) {
  if (!authRequired()) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (isPublicRequest(pathname, request.method)) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      // A refreshed token has to reach both this request and the browser, with the no-store headers Supabase asks for.
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  let claims: Claims = null;
  try {
    const { data } = await supabase.auth.getClaims();
    claims = (data?.claims as Claims | undefined) ?? null;
  } catch {
    // Supabase unreachable: treat as signed out, so the internal app closes instead of opening.
  }

  const decision = decide({ pathname, search, method: request.method, claims, required: true });
  if (decision.action === "allow") return response;

  const carryCookies = (to: NextResponse) => {
    response.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "cache-control") to.headers.set(key, value);
    });
    return to;
  };

  if (decision.action === "unauthorized") {
    return carryCookies(NextResponse.json({ error: "Sign in to use this." }, { status: 401 }));
  }
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  login.searchParams.set("next", decision.next);
  if (decision.error) login.searchParams.set("error", decision.error);
  return carryCookies(NextResponse.redirect(login));
}

export const config = {
  // Everything except Next's own assets, the public model files and the favicon. Whether a path is open to a
  // signed-out visitor is decided in policy.ts, not here, so a new route is closed by default.
  matcher: ["/((?!_next/|models/|favicon\\.ico$).*)"],
};
