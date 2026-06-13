// Competitor intel via Bright Data's Web Scraper API. OPTIONAL, exactly like the
// Supabase store (lib/store.ts): with no BRIGHT_DATA_API_KEY the whole feature is
// a graceful no-op (returns []), so the engine runs precisely as before. When a
// key IS set, we pull each competitor's recent public posts + engagement so the
// planner can design to what actually wins in this space — real benchmarks, not
// invented best practice.
//
// Flow — Bright Data "Dataset API v3" (verified live, 2026): async trigger ->
// poll the snapshot until ready -> download JSON.
//   POST /datasets/v3/trigger?dataset_id=<id>&include_errors=true  -> { snapshot_id }
//        body: {"input":[{"url":"<profile-or-post-url>"}, ...]}   (NOT a bare array)
//   GET  /datasets/v3/progress/{snapshot_id}                      -> { status }
//   GET  /datasets/v3/snapshot/{snapshot_id}?format=json          -> [ ...records ]
// Auth on every call: `Authorization: Bearer <BRIGHT_DATA_API_KEY>`.
//
// Each dataset returns a DIFFERENT shape (confirmed against live data): the X
// dataset yields post records directly, while the Instagram and LinkedIn datasets
// yield a PROFILE record with the posts nested inside (`posts[]` / `activity[]`).
// A per-platform extractor (EXTRACTORS) flattens whatever shape into a flat,
// uniform CompetitorPost[].
import { cacheGet, cacheSet, cacheKey } from "./cache";
import type { Platform } from "./types";

const API = "https://api.brightdata.com/datasets/v3";

// Confirmed-working dataset IDs (each verified live). Env-overridable so you can
// swap a different scraper without a code change; a blank id disables that one
// platform while the others still work. (TikTok gd_l1villgoiiidt09ci is also
// accessible but isn't wired here — it's not one of the app's content platforms.)
const DATASETS: Record<Platform, string> = {
  x: process.env.BRIGHT_DATA_X_DATASET || "gd_lwxkxvnf1cynvib9co",         // X/Twitter posts
  instagram: process.env.BRIGHT_DATA_IG_DATASET || "gd_l1vikfch901nx3by4", // IG profile + posts[]
  linkedin: process.env.BRIGHT_DATA_LI_DATASET || "gd_l1viktl72bvl7bjuj0", // LinkedIn profile + activity[]
};

export interface CompetitorPost {
  platform: Platform;
  url: string;
  text: string; // the post copy — where the CTA we want to study lives
  likes: number;
  comments: number;
  shares: number; // reposts / retweets / shares (0 where the dataset omits it)
  author: string;
}

export function brightDataEnabled(): boolean {
  return !!process.env.BRIGHT_DATA_API_KEY;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.BRIGHT_DATA_API_KEY || ""}`,
    "Content-Type": "application/json",
  };
}

// Read the first present, finite numeric field (engagement counts have different
// names per dataset). Defaults to 0 — a missing number must never crash a run or
// poison the engagement sort.
function num(rec: any, ...keys: string[]): number {
  for (const k of keys) {
    if (rec?.[k] == null) continue;
    const v = Number(rec[k]);
    if (Number.isFinite(v)) return v;
  }
  return 0;
}

type Extractor = (rec: any) => CompetitorPost[];

// One extractor per platform, mapping that dataset's verified shape -> posts.
const EXTRACTORS: Record<Platform, Extractor> = {
  // X: one record = one post, fields at the top level.
  x: (r) => [{
    platform: "x",
    url: r?.url || "",
    text: r?.description || r?.text || "",
    likes: num(r, "likes", "num_likes"),
    comments: num(r, "replies", "num_comments", "comments"),
    shares: num(r, "reposts", "retweets", "num_shares"),
    author: r?.user_posted || r?.name || "",
  }],
  // Instagram: one record = one PROFILE; the posts are nested in `posts[]`.
  instagram: (r) =>
    (Array.isArray(r?.posts) ? r.posts : []).map((p: any) => ({
      platform: "instagram" as const,
      url: p?.url || "",
      text: p?.caption || p?.text || "",
      likes: num(p, "likes", "num_likes"),
      comments: num(p, "comments", "num_comments"),
      shares: 0, // IG dataset doesn't expose shares
      author: r?.account || r?.full_name || r?.profile_name || "",
    })),
  // LinkedIn: one record = one PROFILE; recent posts live in `activity[]`, which
  // carries the post TEXT (`title`) but no per-post engagement, so counts are 0.
  // Activity can include reshares / likes-of-others, not only authored posts — we
  // keep them as CTA-pattern signal but cannot rank them by engagement.
  linkedin: (r) =>
    (Array.isArray(r?.activity) ? r.activity : []).map((a: any) => ({
      platform: "linkedin" as const,
      url: a?.link || "",
      text: a?.title || "",
      likes: 0,
      comments: 0,
      shares: 0,
      author: r?.name || "",
    })),
};

// Pure: flatten raw dataset records into uniform, text-bearing CompetitorPosts.
// Exported + side-effect-free so the per-platform shape handling (incl. the
// nested posts[]/activity[] flattening) is unit-tested offline with no API key —
// mirrors critic.ts's parseCriticVerdict.
export function extractPosts(platform: Platform, records: any[]): CompetitorPost[] {
  return (records || [])
    .flatMap((r) => EXTRACTORS[platform](r))
    .filter((p) => p.text.trim().length > 0);
}

const engagement = (p: CompetitorPost): number => p.likes + p.comments + p.shares;

// --- network helpers ---

// Queue a collection for these profile/post URLs; returns the snapshot id. Body
// shape verified live: {"input":[{"url":...}, ...]} (NOT a bare array).
async function trigger(datasetId: string, urls: string[]): Promise<string> {
  const r = await fetch(`${API}/trigger?dataset_id=${datasetId}&include_errors=true&notify=false`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ input: urls.map((u) => ({ url: u })) }),
  });
  if (!r.ok) throw new Error(`bright-data trigger ${r.status}`);
  const j = await r.json();
  if (!j?.snapshot_id) throw new Error("bright-data: no snapshot_id");
  return j.snapshot_id as string;
}

// Bounded poll (~160s ceiling) — collections take tens of seconds (we measured
// 6-94s). Times out rather than hang the request; the caller treats a timeout as
// "no intel" and proceeds.
async function awaitSnapshot(snapshotId: string, tries = 40, gapMs = 4000): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`${API}/progress/${snapshotId}`, { headers: authHeaders() });
    if (r.ok) {
      const j = await r.json();
      if (j?.status === "ready") return;
      if (j?.status === "failed") throw new Error("bright-data snapshot failed");
    }
    await new Promise((res) => setTimeout(res, gapMs));
  }
  throw new Error("bright-data snapshot timed out");
}

async function download(snapshotId: string): Promise<any[]> {
  const r = await fetch(`${API}/snapshot/${snapshotId}?format=json`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`bright-data download ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

// Pull recent public posts for a set of competitor profile/post URLs on one
// platform, ranked by engagement. Graceful: returns [] when disabled, when no
// dataset is configured for this platform, or on ANY error — the caller treats
// "no posts" as simply "skip the competitor signal". Disk-cached so the demo
// stays instant and we never re-spend Bright Data credits on the same inputs.
export async function scrapeCompetitorPosts(
  platform: Platform,
  urls: string[],
  limit = 20,
): Promise<CompetitorPost[]> {
  if (!brightDataEnabled() || !urls.length) return [];
  const datasetId = DATASETS[platform];
  if (!datasetId) return [];

  const key = cacheKey(["bd-posts", platform, datasetId, urls, limit]);
  const cached = cacheGet<CompetitorPost[]>(key);
  if (cached) return cached;

  try {
    const snap = await trigger(datasetId, urls);
    await awaitSnapshot(snap);
    const posts = extractPosts(platform, await download(snap))
      .sort((a, b) => engagement(b) - engagement(a))
      .slice(0, limit);
    cacheSet(key, posts);
    return posts;
  } catch {
    return []; // never break a generation run on a scrape failure
  }
}
