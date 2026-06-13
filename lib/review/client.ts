// Supabase access for the REVIEWER. Unlike lib/store.ts (which degrades to a
// no-op when there's no DB, because the creation app can live without one), the
// reviewer is a queue consumer — no DB means nothing to do, so this throws if
// it isn't configured. All writes are *guarded by claimed_by*: the reviewer
// only ever mutates a row it currently owns, so two reviewers can't clobber
// each other and a verdict can never land on a row someone else is reviewing.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  STATUS,
  REVIEW_SELECT,
  bestImageUrl,
  type AssetRow,
  type AssetStatus,
  type ReviewRecord,
} from "./contract";

let _client: SupabaseClient | null | undefined;

export function reviewerDb(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key)
    throw new Error(
      "Reviewer needs SUPABASE_URL + SUPABASE_SERVICE_KEY (see .env.example).",
    );
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

const nowIso = () => new Date().toISOString();

// Claim the next pending asset for this reviewer using the partner's atomic
// RPC (claim_next_asset). The RPC does the FOR UPDATE SKIP LOCKED dance in the
// DB, so concurrent reviewers never grab the same row. Returns null when the
// queue is empty. We then ensure status='reviewing' (tolerant of whatever the
// RPC set) so the row is visibly in-flight and recoverable as a stale claim.
export async function claimNext(
  reviewer: string,
  org?: string,
): Promise<AssetRow | null> {
  const db = reviewerDb();
  const args: Record<string, string> = { p_reviewer: reviewer };
  if (org) args.p_org = org;
  const { data, error } = await db.rpc("claim_next_asset", args);
  if (error) throw new Error(`claim_next_asset failed: ${error.message}`);

  // RPC may return a single row, an array, or null/empty when nothing's queued.
  const claimed: AssetRow | null = Array.isArray(data) ? data[0] ?? null : data ?? null;
  if (!claimed) return null;
  if (claimed.claimed_by && claimed.claimed_by !== reviewer) {
    // Shouldn't happen (RPC claims for us). If it does, the RPC isn't claiming
    // atomically — surface it loudly rather than looking like an empty queue.
    console.warn(`claim_next_asset returned row ${claimed.id} owned by ${claimed.claimed_by}, not ${reviewer} — RPC may not be atomic`);
    return null;
  }

  // Mark in-flight if the RPC left it pending. Guarded by claimed_by so we only
  // touch the row we just won. We re-read the representation to return the truth.
  if (claimed.status === STATUS.PENDING) {
    const { data: upd } = await db
      .from("assets")
      .update({ status: STATUS.REVIEWING, claimed_by: reviewer, claimed_at: nowIso() })
      .eq("id", claimed.id)
      .eq("claimed_by", reviewer)
      .select(REVIEW_SELECT)
      .maybeSingle();
    if (upd) return upd as unknown as AssetRow;
  }
  return claimed;
}

// Fallback claim that needs NO server-side RPC — pure optimistic concurrency, in
// case the RPC is ever absent. Pick the oldest unclaimed pending row, then PATCH
// it guarded by `status=pending_review`; PostgREST runs that as a single locking
// UPDATE, so exactly one racing reviewer's update matches and returns the row.
export async function claimNextViaPatch(
  reviewer: string,
  org?: string,
): Promise<AssetRow | null> {
  const db = reviewerDb();
  let q = db
    .from("assets")
    .select("id")
    .eq("status", STATUS.PENDING)
    .is("claimed_by", null)
    .order("created_at", { ascending: true })
    .limit(5);
  if (org) q = q.eq("org", org);
  const { data: cands, error } = await q;
  if (error) throw new Error(`claim scan failed: ${error.message}`);

  for (const c of cands ?? []) {
    const { data: won } = await db
      .from("assets")
      .update({ status: STATUS.REVIEWING, claimed_by: reviewer, claimed_at: nowIso() })
      .eq("id", (c as { id: string }).id)
      .eq("status", STATUS.PENDING) // ← the atomic guard: only one update wins
      .select(REVIEW_SELECT)
      .maybeSingle();
    if (won) return won as unknown as AssetRow;
    // else: lost the race for this id, try the next candidate
  }
  return null;
}

// Write the terminal verdict. Guarded by (id, claimed_by) so we can only finish
// a row we still own — if a stale-reclaim already requeued it, this no-ops.
export async function writeVerdict(
  row: AssetRow,
  status: AssetStatus,
  review: ReviewRecord,
): Promise<boolean> {
  const db = reviewerDb();
  const { data, error } = await db
    .from("assets")
    .update({ status, review, updated_at: nowIso() }) // leave claimed_at as the claim time
    .eq("id", row.id)
    .eq("claimed_by", review.reviewer)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`writeVerdict failed: ${error.message}`);
  return !!data;
}

// Hand a claimed row back to the queue (e.g. the image 404'd — a transient
// problem, not the image's fault). Guarded by claimed_by.
export async function releaseClaim(id: string, reviewer: string): Promise<void> {
  const db = reviewerDb();
  await db
    .from("assets")
    .update({ status: STATUS.PENDING, claimed_by: null, claimed_at: null })
    .eq("id", id)
    .eq("claimed_by", reviewer);
}

// Recover rows whose reviewer crashed mid-review: anything stuck in 'reviewing'
// with a claim older than ttlMs goes back to pending_review. Returns how many.
export async function reclaimStale(ttlMs: number): Promise<number> {
  const db = reviewerDb();
  const cutoff = new Date(Date.now() - ttlMs).toISOString();
  const { data, error } = await db
    .from("assets")
    .update({ status: STATUS.PENDING, claimed_by: null, claimed_at: null })
    .eq("status", STATUS.REVIEWING)
    .lt("claimed_at", cutoff)
    .select("id");
  if (error) throw new Error(`reclaimStale failed: ${error.message}`);
  return (data ?? []).length;
}

export interface QueueStats {
  pending: number;
  reviewing: number;
  approved: number;
  rejected: number;
  regenerated: number;
}

export async function queueStats(org?: string): Promise<QueueStats> {
  const db = reviewerDb();
  const count = async (status: AssetStatus) => {
    let q = db.from("assets").select("id", { count: "exact", head: true }).eq("status", status);
    if (org) q = q.eq("org", org);
    const { count: n } = await q;
    return n ?? 0;
  };
  const [pending, reviewing, approved, rejected, regenerated] = await Promise.all([
    count(STATUS.PENDING),
    count(STATUS.REVIEWING),
    count(STATUS.APPROVED),
    count(STATUS.REJECTED),
    count(STATUS.REGENERATED),
  ]);
  return { pending, reviewing, approved, rejected, regenerated };
}

// Pull the actual image bytes (public `media` bucket → a plain fetch works).
// Used by the heuristic critic; the vision critic fetches inside askVision.
export async function downloadImage(
  row: AssetRow,
): Promise<{ bytes: Uint8Array; contentType: string; url: string } | null> {
  const url = bestImageUrl(row);
  if (!url) return null;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`image fetch ${r.status} for ${url}`);
  const contentType = (r.headers.get("content-type") || "application/octet-stream").split(";")[0];
  return { bytes: new Uint8Array(await r.arrayBuffer()), contentType, url };
}
