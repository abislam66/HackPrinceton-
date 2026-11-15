import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let client: SupabaseClient<Database> | null = null;

/**
 * Supabase client with the secret key, for server code that reaches tables the browser must not
 * (the records store). It bypasses RLS, so never import it from a Client Component.
 */
export function createAdminClient(): SupabaseClient<Database> {
  client ??= createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
