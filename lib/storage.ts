// ── SUPABASE STORAGE ─────────────────────────────────────────────────────────
// The creation side copies each rendered image/keyframe into the public `media`
// bucket so it has a permanent, directly-fetchable URL (fal render URLs are
// long-lived but not forever) and so the image critic can look at it. This is
// the bytes half of the contract; the row half lives in lib/store.ts
// (enqueueForReview). Uses the service key (via store.ts's client), so it
// bypasses RLS and can write to Storage from a server route.
import { createHash } from "crypto";
import { db } from "./store";

export const MEDIA_BUCKET = "media";

// Map a content-type to a file extension for the object key (cosmetic — the
// bucket serves bytes by their stored content-type regardless).
function extFor(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
    "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  };
  return map[contentType.toLowerCase()] || "bin";
}

// A short, deterministic content hash so re-uploading the same render lands on
// the same key (idempotent) — no Math.random/Date, which keeps it reproducible.
function shortHash(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 8);
}

// The object key, matching the live convention: org/<plan|adhoc>/<slot>/vN-<hash>.<ext>
export function storagePathFor(opts: {
  org: string; planId?: string | null; slot?: string | null;
  version?: number; sourceUrl: string; contentType?: string; ext?: string;
}): string {
  const org = opts.org || "demo";
  const plan = opts.planId || "adhoc";
  const slot = opts.slot || "slot";
  const version = opts.version || 1;
  const ext = opts.ext || (opts.contentType ? extFor(opts.contentType) : "jpg");
  return `${org}/${plan}/${slot}/v${version}-${shortHash(opts.sourceUrl)}.${ext}`;
}

export interface UploadResult {
  storagePath: string;
  publicUrl: string;
  contentType: string;
  bytes: number;
}

// Copy the bytes at `sourceUrl` (a fresh fal render URL) into the bucket at
// `path`. upsert:true so a retry of the same render is idempotent. Returns the
// permanent public URL the reviewer will fetch. Throws (caller decides) if
// there's no DB configured or the fetch/upload fails — uploading is the whole
// point of calling this, so a silent no-op would hide a real failure.
export async function uploadImageFromUrl(sourceUrl: string, path: string): Promise<UploadResult> {
  const c = db();
  if (!c) throw new Error("Supabase not configured (SUPABASE_URL + SUPABASE_SERVICE_KEY).");

  const r = await fetch(sourceUrl);
  if (!r.ok) throw new Error(`source fetch ${r.status} for ${sourceUrl}`);
  const contentType = (r.headers.get("content-type") || "application/octet-stream").split(";")[0];
  // Guard against uploading a non-media body (an HTML/JSON error page from a
  // dead render URL would otherwise land in the bucket as "media").
  if (!/^(image|video)\//.test(contentType))
    throw new Error(`refusing to upload non-media content-type "${contentType}" from ${sourceUrl}`);
  // Buffer (not raw ArrayBuffer) is the input type supabase-js v2 documents for Node.
  const buf = Buffer.from(await r.arrayBuffer());

  const { error } = await c.storage.from(MEDIA_BUCKET).upload(path, buf, {
    contentType,
    upsert: true,
    cacheControl: "3600",
  });
  if (error) throw new Error(`storage upload failed: ${error.message}`);

  const { data } = c.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return { storagePath: path, publicUrl: data.publicUrl, contentType, bytes: buf.byteLength };
}
