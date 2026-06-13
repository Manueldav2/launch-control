// Durable, cross-instance cache (Supabase) so a repeated input returns instantly
// — the whole generated week (with rendered media) and the channel/sidebar data,
// no waiting on the LLM, the critic, fal, or Zernio. Keyed by the normalized
// inputs, so clicking the same preset (or re-running the same brief) is instant
// for anyone. Degrades to a no-op when Supabase isn't configured.
import { createHash } from "crypto";
import { db } from "./store";

export function cacheKeyFor(inputs: { goal?: string; cta?: string; website?: string; location?: string; eventWeekday?: string }): string {
  const norm = (s?: string) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
  const sig = [norm(inputs.goal), norm(inputs.cta), norm(inputs.website), norm(inputs.location), norm(inputs.eventWeekday)].join("|");
  return "week:" + createHash("sha1").update(sig).digest("hex").slice(0, 24);
}

export async function getCached<T = any>(key: string): Promise<T | null> {
  const c = db();
  if (!c) return null;
  try {
    const { data } = await c.from("demo_cache").select("value").eq("key", key).maybeSingle();
    return (data?.value as T) ?? null;
  } catch { return null; }
}

// Like getCached but only returns the value if it was written within ttlMs.
export async function getCachedFresh<T = any>(key: string, ttlMs: number): Promise<T | null> {
  const c = db();
  if (!c) return null;
  try {
    const { data } = await c.from("demo_cache").select("value, updated_at").eq("key", key).maybeSingle();
    if (!data) return null;
    if (ttlMs && Date.now() - new Date(data.updated_at as string).getTime() > ttlMs) return null;
    return (data.value as T) ?? null;
  } catch { return null; }
}

export async function setCached(key: string, value: unknown): Promise<void> {
  const c = db();
  if (!c) return;
  try {
    await c.from("demo_cache").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  } catch { /* best-effort */ }
}
