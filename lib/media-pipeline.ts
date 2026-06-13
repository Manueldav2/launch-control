// Media-passing pipeline: the decoupled seam between creation (fal renders) and
// review (the partner's visual critic + regenerate loop). Creation persists
// render bytes to Supabase Storage and enqueues a self-describing asset row with
// status='pending_review'. The reviewer claims, judges, and regenerates through
// the three /api/review endpoints. See docs/media-pipeline.md.
//
// Every function degrades gracefully: no Supabase configured → no-op that
// returns the fal url as-is, exactly like lib/store.ts. The app never errors
// because the DB/bucket is absent.
import { db } from "./store";
import { cacheKey } from "./cache";
import { renderMedia } from "./media-gen";

const BUCKET = process.env.SUPABASE_MEDIA_BUCKET || "media";

export interface EnqueueInput {
  url: string;              // the fal render url
  contentType: string;      // image | ugc_video | motion_video
  org?: string;
  platform?: string;
  day?: string;
  brand?: string;
  caption?: string;
  slot?: string;            // "<day>:<platform>"
  planId?: string;
  prompt?: string;
  intent?: string;
  brandColors?: string[];
  location?: string;
  posterUrl?: string;       // keyframe still
  version?: number;
  parentId?: string;        // lineage root for regenerations
}

export interface AssetRow {
  id: string;
  org: string;
  content_type: string;
  status: string;
  version: number;
  parent_id: string | null;
  public_url: string | null;
  source_url: string | null;
  poster_url: string | null;
  prompt: string | null;
  intent: string | null;
  brand_colors: string[] | null;
  location: string | null;
  slot: string | null;
  plan_id: string | null;
  platform: string | null;
  day: string | null;
  brand: string | null;
  caption: string | null;
  review: unknown;
  [k: string]: unknown;
}

// Create the public bucket if it isn't there yet (idempotent; ignores "exists").
async function ensureBucket(c: NonNullable<ReturnType<typeof db>>): Promise<void> {
  try { await c.storage.createBucket(BUCKET, { public: true }); } catch { /* already exists */ }
}

// Pick a file extension + content-type from the response, defaulting sensibly.
function mediaMeta(contentType: string, headerCT: string | null): { ext: string; ctype: string } {
  if (contentType === "image") {
    if (headerCT?.includes("png")) return { ext: "png", ctype: "image/png" };
    if (headerCT?.includes("webp")) return { ext: "webp", ctype: "image/webp" };
    return { ext: "jpg", ctype: headerCT || "image/jpeg" };
  }
  if (headerCT?.includes("webm")) return { ext: "webm", ctype: "video/webm" };
  return { ext: "mp4", ctype: "video/mp4" };
}

// Download the fal bytes and copy them into Supabase Storage for permanence.
// Returns null (caller falls back to the fal url) on any failure.
export async function persistToStorage(
  falUrl: string,
  o: { org: string; planId?: string; slot?: string; version: number; contentType: string }
): Promise<{ storagePath: string; publicUrl: string } | null> {
  const c = db();
  if (!c || !falUrl) return null;
  try {
    await ensureBucket(c);
    const res = await fetch(falUrl);
    if (!res.ok) return null;
    const { ext, ctype } = mediaMeta(o.contentType, res.headers.get("content-type"));
    const bytes = new Uint8Array(await res.arrayBuffer());
    const tag = cacheKey([falUrl]).slice(0, 8);
    const safeSlot = (o.slot || "slot").replace(/[^a-zA-Z0-9_-]/g, "_");
    const path = `${o.org}/${o.planId || "adhoc"}/${safeSlot}/v${o.version}-${tag}.${ext}`;
    const { error } = await c.storage.from(BUCKET).upload(path, bytes, { contentType: ctype, upsert: true });
    if (error) return null;
    const { data } = c.storage.from(BUCKET).getPublicUrl(path);
    return { storagePath: path, publicUrl: data.publicUrl };
  } catch {
    return null;
  }
}

// Persist bytes + insert the asset row at status='pending_review'. No DB → the
// fal url is returned unchanged and nothing is queued (persisted:false).
export async function enqueueAsset(
  a: EnqueueInput
): Promise<{ id: string | null; persisted: boolean; publicUrl: string }> {
  const c = db();
  const version = a.version || 1;
  const org = a.org || "demo";
  if (!c) return { id: null, persisted: false, publicUrl: a.url };

  const stored = await persistToStorage(a.url, {
    org, planId: a.planId, slot: a.slot, version, contentType: a.contentType,
  });
  const publicUrl = stored?.publicUrl || a.url;

  const row = {
    org,
    url: publicUrl,                       // legacy column mirrors the shippable url
    content_type: a.contentType,
    platform: a.platform || null,
    day: a.day || null,
    brand: a.brand || null,
    caption: a.caption || null,
    slot: a.slot || null,
    plan_id: a.planId || null,
    prompt: a.prompt || null,
    intent: a.intent || null,
    brand_colors: a.brandColors || null,
    location: a.location || null,
    source_url: a.url,
    storage_path: stored?.storagePath || null,
    public_url: stored?.publicUrl || null,
    poster_url: a.posterUrl || null,
    status: "pending_review",
    version,
    parent_id: a.parentId || null,
  };
  try {
    const { data, error } = await c.from("assets").insert(row).select("id").single();
    if (error) return { id: null, persisted: !!stored, publicUrl };
    return { id: (data as { id: string })?.id || null, persisted: !!stored, publicUrl };
  } catch {
    return { id: null, persisted: !!stored, publicUrl };
  }
}

// Atomically claim the oldest pending asset for a reviewer. Null if queue empty.
export async function claimNextForReview(reviewer: string, org?: string): Promise<AssetRow | null> {
  const c = db();
  if (!c) return null;
  try {
    const { data, error } = await c.rpc("claim_next_asset", { p_reviewer: reviewer, p_org: org ?? null });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return (row as AssetRow) || null;
  } catch {
    return null;
  }
}

// Terminal verdict: approve or reject + store the reviewer's VisualVerdict.
export async function submitReview(id: string, v: { pass: boolean; verdict?: unknown }): Promise<boolean> {
  const c = db();
  if (!c) return false;
  try {
    const { error } = await c.from("assets")
      .update({ status: v.pass ? "approved" : "rejected", review: v.verdict ?? null, updated_at: new Date().toISOString() })
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

// Regenerate: re-render via fal with an adjusted prompt, persist, and insert a
// child version at pending_review. The parent is marked 'regenerating'. Returns
// the new asset id. The fal key + branding stay here; the reviewer only sends
// the prompt tweak.
export async function requestRegen(
  id: string,
  adj: { prompt?: string; intent?: string }
): Promise<{ id: string | null; publicUrl: string } | null> {
  const c = db();
  if (!c) return null;
  try {
    const { data: orig, error } = await c.from("assets").select("*").eq("id", id).single();
    if (error || !orig) return null;
    const o = orig as AssetRow;

    await c.from("assets").update({ status: "regenerating", updated_at: new Date().toISOString() }).eq("id", id);

    const prompt = adj.prompt || o.prompt || "";
    const intent = adj.intent || o.intent || undefined;
    const { url, stillUrl } = await renderMedia({
      contentType: o.content_type,
      prompt,
      intent,
      brandColors: o.brand_colors || undefined,
      location: o.location || undefined,
    });

    const child = await enqueueAsset({
      url,
      contentType: o.content_type,
      org: o.org,
      platform: o.platform || undefined,
      day: o.day || undefined,
      brand: o.brand || undefined,
      caption: o.caption || undefined,
      slot: o.slot || undefined,
      planId: o.plan_id || undefined,
      prompt,
      intent,
      brandColors: o.brand_colors || undefined,
      location: o.location || undefined,
      posterUrl: stillUrl,
      version: (o.version || 1) + 1,
      parentId: o.parent_id || o.id,   // chain to the lineage root
    });
    return { id: child.id, publicUrl: child.publicUrl };
  } catch {
    return null;
  }
}

export async function getAsset(id: string): Promise<AssetRow | null> {
  const c = db();
  if (!c) return null;
  try {
    const { data } = await c.from("assets").select("*").eq("id", id).single();
    return (data as AssetRow) || null;
  } catch {
    return null;
  }
}
