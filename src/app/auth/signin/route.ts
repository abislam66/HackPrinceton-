import { NextResponse } from "next/server";
import { authRequired, safeNext } from "@/lib/auth/policy";
import { NEXT_COOKIE } from "@/lib/auth/session-cookie";
import { createClient } from "@/lib/supabase/server";

/**
 * Starts Google sign-in. Asks Supabase for the Google URL (it also stores the PKCE verifier in a cookie) and sends the
 * browser there. Where to land afterwards is kept in a short-lived cookie, so the callback URL stays a bare
 * `/auth/callback`, the one thing to list in Supabase's redirect URLs.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  if (!authRequired()) return NextResponse.redirect(new URL(next, url.origin));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${url.origin}/auth/callback`,
      // Always show the account chooser, so someone with several Google accounts picks the right one.
      queryParams: { prompt: "select_account" },
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) {
    console.error("Google sign-in could not start", error?.message ?? "no URL returned");
    return NextResponse.redirect(new URL("/login?error=failed", url.origin));
  }

  const response = NextResponse.redirect(data.url);
  response.cookies.set(NEXT_COOKIE, next, { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/", maxAge: 600 });
  return response;
}
