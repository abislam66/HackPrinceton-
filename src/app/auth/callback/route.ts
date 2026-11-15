import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { allowedEmails, isAllowedUser, safeNext } from "@/lib/auth/policy";
import { NEXT_COOKIE } from "@/lib/auth/session-cookie";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Google sends the browser back (through Supabase). Trades the one-time code for a session, then checks the
 * person is allowed in: a Google sign-in, and on ALLOWED_EMAILS when that is set. Anyone else is signed out again here,
 * so a refused account never keeps a session.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const next = safeNext(cookieStore.get(NEXT_COOKIE)?.value);
  const back = (error: "failed" | "not-allowed") => {
    const response = NextResponse.redirect(new URL(`/login?error=${error}`, url.origin));
    response.cookies.delete(NEXT_COOKIE);
    return response;
  };

  // Google or Supabase refused (the person cancelled, or a setting is wrong): the reason is in the query.
  if (url.searchParams.get("error")) {
    console.error("Google sign-in was refused", url.searchParams.get("error_code") ?? url.searchParams.get("error"));
    return back("failed");
  }
  const code = url.searchParams.get("code");
  if (!code) return back("failed");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("Google sign-in code exchange failed", error.message);
    return back("failed");
  }

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const allowed = isAllowedUser({ email: user?.email, app_metadata: user?.app_metadata }, allowedEmails());
  if (!allowed) {
    await supabase.auth.signOut({ scope: "local" });
    return back("not-allowed");
  }

  const response = NextResponse.redirect(new URL(next, url.origin));
  response.cookies.delete(NEXT_COOKIE);
  return response;
}
