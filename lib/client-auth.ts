"use client";
// Attach the signed-in user's access token to a fetch. Generation is gated on
// sign-in, so the client sends this on /api/generate-week + /api/generate-media.
import { supabaseBrowser } from "./supabase-browser";

export async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  if (!sb) return {};
  const { data } = await sb.auth.getSession();
  const t = data.session?.access_token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
