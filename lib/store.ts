// Optional persistence (Supabase). The whole app works WITHOUT a database —
// the assets gallery falls back to the browser (localStorage), media lives at
// its render URL, and the week plan is disk-cached. The moment you set
// SUPABASE_URL + SUPABASE_SERVICE_KEY, generated media + plans persist
// server-side and across devices. No DB = graceful no-op, never an error.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null | undefined;

export function db(): SupabaseClient | null {
  if (_client !== undefined) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  _client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return _client;
}

export function dbEnabled(): boolean {
  return db() !== null;
}

export type AssetRecord = {
  org?: string;          // a workspace/user handle (optional; "demo" by default)
  url: string;
  content_type: string;  // image | ugc_video | motion_video
  platform: string;
  day?: string;
  brand?: string;
  caption?: string;
};

// Save one generated asset. No-op (returns false) if no DB configured.
export async function saveAsset(a: AssetRecord): Promise<boolean> {
  const c = db();
  if (!c) return false;
  try {
    await c.from("assets").upsert(
      { org: a.org || "demo", url: a.url.split("?")[0], content_type: a.content_type,
        platform: a.platform, day: a.day || null, brand: a.brand || null, caption: a.caption || null },
      { onConflict: "org,url" });
    return true;
  } catch { return false; }
}

export async function listAssets(org = "demo", limit = 60): Promise<AssetRecord[]> {
  const c = db();
  if (!c) return [];
  try {
    const { data } = await c.from("assets").select("*")
      .eq("org", org).order("created_at", { ascending: false }).limit(limit);
    return (data as AssetRecord[]) || [];
  } catch { return []; }
}

// Persist a whole generated week so it survives a refresh / is shareable.
export async function savePlan(org: string, inputs: unknown, plan: unknown): Promise<boolean> {
  const c = db();
  if (!c) return false;
  try {
    await c.from("plans").insert({ org: org || "demo", inputs, plan });
    return true;
  } catch { return false; }
}
