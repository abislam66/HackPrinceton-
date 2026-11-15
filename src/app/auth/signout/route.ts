import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Signs this browser out and returns to the sign-in page. POST only, so a link or an image can't sign anyone out. */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
