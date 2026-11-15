import "server-only";
import { createClient } from "@/lib/supabase/server";
import { authRequired, isAllowedUser, type Claims } from "./policy";

/**
 * The signed-in person's claims from the session cookie, verified against Supabase's signing keys. Null when sign-in is
 * off, when nobody is signed in, or when Supabase can't be reached (the safe answer is "not signed in").
 */
export async function getSessionClaims(): Promise<Claims> {
  if (!authRequired()) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    return (data?.claims as Claims | undefined) ?? null;
  } catch {
    return null;
  }
}

/** The email shown in the sidebar: only for an allowed, signed-in person. Null when sign-in is off or nobody is in. */
export async function getSessionEmail(): Promise<string | null> {
  const claims = await getSessionClaims();
  return claims && isAllowedUser(claims) && claims.email ? claims.email : null;
}
