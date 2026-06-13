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

// Save one generated asset directly (the client gallery save). This is a direct,
// already-accepted save — not a review-queue entry — so it lands as 'approved'
// and shows in the gallery. The review lifecycle (pending_review → approved) runs
// through lib/media-pipeline's enqueueAsset instead. No-op (false) if no DB.
export async function saveAsset(a: AssetRecord): Promise<boolean> {
  const c = db();
  if (!c) return false;
  try {
    await c.from("assets").upsert(
      { org: a.org || "demo", url: a.url.split("?")[0], content_type: a.content_type,
        platform: a.platform, day: a.day || null, brand: a.brand || null, caption: a.caption || null,
        status: "approved" },
      { onConflict: "org,url" });
    return true;
  } catch { return false; }
}

// List assets newest-first. Pass status (e.g. "approved") to show only that
// stage of the review lifecycle; omit it for everything. The Asset Bay reads
// status="approved" so pending/rejected renders never show in the gallery.
export async function listAssets(org = "demo", limit = 60, status?: string): Promise<AssetRecord[]> {
  const c = db();
  if (!c) return [];
  try {
    let q = c.from("assets").select("*").eq("org", org);
    if (status) q = q.eq("status", status);
    const { data } = await q.order("created_at", { ascending: false }).limit(limit);
    return (data as AssetRecord[]) || [];
  } catch { return []; }
}

// ── PRODUCER: write the asset into the review queue ──────────────────────────
// The creation side's other half: copy the render into Supabase Storage, then
// insert an `assets` row with status='pending_review' so the (independent)
// image critic can claim and review it. This is the producer end of the
// contract in lib/review/contract.ts — it ONLY writes Storage + the table, and
// never talks to the reviewer's code. See docs/review-contract.md.
import { STATUS } from "./review/contract";
import { uploadImageFromUrl, storagePathFor } from "./storage";

export interface EnqueueInput {
  sourceUrl: string;        // the fresh render URL (e.g. from fal)
  contentType: string;      // image | ugc_video | motion_video
  org?: string;
  prompt?: string;          // the generation prompt (the critic's "intent")
  intent?: string;
  brandColors?: string[];
  platform?: string;
  day?: string;
  caption?: string;
  location?: string;
  planId?: string;
  slot?: string;
  version?: number;         // 1 for a fresh asset; v+1 on a regenerate
  parentId?: string;        // prior version's id on a regenerate
  posterUrl?: string;       // a still/keyframe for video
}

export interface EnqueueResult {
  id: string;
  storagePath: string;
  publicUrl: string;
  status: string;
}

// Upload the bytes, then enqueue the row. Returns null (no throw) when there's
// no DB configured, so the creation app degrades gracefully; a real
// upload/insert failure DOES throw so the caller surfaces it.
//
// We upload the INSPECTABLE STILL — the image the critic actually grades: the
// image itself for an image slot, the keyframe (posterUrl) for a video slot.
// The original render URL (the video, for a video slot) is kept in source_url.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function asUuid(name: string, v?: string): string | null {
  if (v == null || v === "") return null;
  if (!UUID_RE.test(v)) throw new Error(`${name} must be a UUID, got "${v}"`);
  return v;
}

export async function enqueueForReview(input: EnqueueInput): Promise<EnqueueResult | null> {
  const c = db();
  if (!c) return null;
  const org = input.org || "demo";
  const version = input.version && input.version > 0 ? input.version : 1;
  // Validate uuid inputs up front (these come from the HTTP body) so a bad value
  // fails fast with a clear message instead of a generic insert error.
  const planId = asUuid("plan_id", input.planId);
  const parentId = asUuid("parent_id", input.parentId);
  const isVideo = input.contentType === "ugc_video" || input.contentType === "motion_video";
  const inspectUrl = input.posterUrl || input.sourceUrl; // the still to look at

  const path = storagePathFor({
    org, planId: input.planId, slot: input.slot, version, sourceUrl: inspectUrl, ext: "jpg",
  });
  const up = await uploadImageFromUrl(inspectUrl, path);

  const row = {
    org,
    content_type: input.contentType,
    url: up.publicUrl,
    public_url: up.publicUrl,   // the critic fetches this image
    storage_path: up.storagePath,
    source_url: input.sourceUrl, // the original render (the video, for video slots)
    poster_url: isVideo ? up.publicUrl : null, // keyframe pointer — video only (schema semantics)
    prompt: input.prompt || null,
    intent: input.intent || null,
    brand_colors: input.brandColors || [],
    platform: input.platform || null,
    day: input.day || null,
    caption: input.caption || null,
    location: input.location || null,
    plan_id: planId,
    slot: input.slot || null,
    version,
    parent_id: parentId,
    status: STATUS.PENDING, // ← enters the critic's queue
  };
  const { data, error } = await c.from("assets").insert(row).select("id").single();
  if (error) throw new Error(`enqueue insert failed: ${error.message}`);
  return { id: (data as { id: string }).id, storagePath: up.storagePath, publicUrl: up.publicUrl, status: STATUS.PENDING };
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
