"use client";
// Browser Supabase client for email/password auth. Uses the PUBLIC anon key
// (safe to ship to the browser); the session is persisted in localStorage by
// supabase-js so users stay signed in across visits. All privileged work still
// happens server-side with the service key — this client only does auth.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null; // auth simply unavailable if unconfigured
  _client = createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "lc-auth" },
  });
  return _client;
}
