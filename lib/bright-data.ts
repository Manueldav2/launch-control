// Competitor intel via Bright Data's Web Scraper API. OPTIONAL, exactly like the
// Supabase store (lib/store.ts): with no BRIGHTDATA_API_TOKEN the whole feature
// is a graceful no-op (returns []), so the engine runs precisely as before. When
// a token IS set, we pull each competitor's recent public posts + engagement so
// the planner can design to what actually wins in this space — real benchmarks,
// not invented best practice.
//
// Flow — Bright Data "Dataset API v3" (endpoints verified 2026): async trigger
// -> poll the snapshot until ready -> download JSON.
//   POST /datasets/v3/trigger?dataset_id=<id>&format=json   -> { snapshot_id }
//   GET  /datasets/v3/progress/{snapshot_id}                -> { status }
//   GET  /datasets/v3/snapshot/{snapshot_id}?format=json    -> [ ...records ]
// Auth on every call: `Authorization: Bearer <token>`.
import { cacheGet, cacheSet, cacheKey } from "./cache";
import type { Platform } from "./types";

const API = "https://api.brightdata.com/datasets/v3";

// Dataset IDs for the social scrapers. Only the X/Twitter posts id is published
// verbatim in Bright Data's docs; the Instagram and LinkedIn POST datasets are
// NOT enumerated publicly, so they are env-overridable and blank by default —
// grab the real id from the dashboard (brightdata.com/cp/scrapers/browse -> open
// the scraper -> "API" tab) and set the matching env var. A blank id simply
// disables that one platform; the others still work.
const DATASETS: Record<Platform, string> = {
  x: process.env.BRIGHTDATA_X_DATASET || "gd_lwxkxvnf1cynvib9co", // X/Twitter posts (from docs)
  instagram: process.env.BRIGHTDATA_IG_DATASET || "",            // IG posts — set from dashboard
  linkedin: process.env.BRIGHTDATA_LI_DATASET || "",             // LinkedIn posts — set from dashboard
};

export interface CompetitorPost {
  platform: Platform;
  url: string;
  text: string; // the post copy — this is where the CTA we want to study lives
  likes: number;
  comments: number;
  shares: number; // reposts / retweets / shares
  author: string;
}

export function brightDataEnabled(): boolean {
  return !!process.env.BRIGHTDATA_API_TOKEN;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.BRIGHTDATA_API_TOKEN || ""}`,
    "Content-Type": "application/json",
  };
}

// Collect-by-URL: POST competitor profile URLs to the posts dataset and get back
// their recent posts (matches Bright Data's documented curl example). Some
// datasets instead want discovery params (&type=discover_new&discover_by=
// profile_url) — confirm on the scraper's dashboard "API" tab and add them here
// if your chosen dataset requires it.
async function trigger(datasetId: string, profileUrls: string[]): Promise<string> {
  const r = await fetch(`${API}/trigger?dataset_id=${datasetId}&format=json`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(profileUrls.map((u) => ({ url: u }))),
  });
  if (!r.ok) throw new Error(`bright-data trigger ${r.status}`);
  const j = await r.json();
  if (!j?.snapshot_id) throw new Error("bright-data: no snapshot_id");
  return j.snapshot_id as string;
}

// Bright Data scrapes are async and can take tens of seconds, so this is a
// bounded poll (default ~96s), not a hot loop. Times out rather than hang the
// request — the caller treats a timeout as "no intel" and proceeds.
async function awaitSnapshot(snapshotId: string, tries = 24, gapMs = 4000): Promise<void> {
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

// Normalize a raw Bright Data record into our shape. Field names vary per
// dataset, so we read several likely keys and default to 0 / "" — a missing
// engagement number must never crash the run.
function normalize(rec: any, platform: Platform): CompetitorPost {
  const num = (...keys: string[]): number => {
    for (const k of keys) {
      const v = Number(rec?.[k]);
      if (Number.isFinite(v) && rec?.[k] != null) return v;
    }
    return 0;
  };
  return {
    platform,
    url: rec?.url || rec?.post_url || rec?.link || "",
    text: rec?.description || rec?.text || rec?.caption || rec?.content || "",
    likes: num("likes", "num_likes", "favorites", "like_count"),
    comments: num("comments", "num_comments", "replies", "comment_count"),
    shares: num("reposts", "shares", "retweets", "num_shares"),
    author: rec?.user_posted || rec?.author || rec?.profile_name || "",
  };
}

const engagement = (p: CompetitorPost): number => p.likes + p.comments + p.shares;

// Pull recent public posts for a set of competitor profile URLs on one platform,
// ranked by engagement. Graceful: returns [] when disabled, when no dataset is
// configured for this platform, or on ANY error — the caller treats "no posts"
// as simply "skip the competitor signal". Disk-cached so the demo stays instant
// and we never re-spend Bright Data credits on the same inputs.
export async function scrapeCompetitorPosts(
  platform: Platform,
  profileUrls: string[],
  limit = 20,
): Promise<CompetitorPost[]> {
  if (!brightDataEnabled() || !profileUrls.length) return [];
  const datasetId = DATASETS[platform];
  if (!datasetId) return [];

  const key = cacheKey(["bd-posts", platform, datasetId, profileUrls, limit]);
  const cached = cacheGet<CompetitorPost[]>(key);
  if (cached) return cached;

  try {
    const snap = await trigger(datasetId, profileUrls);
    await awaitSnapshot(snap);
    const posts = (await download(snap))
      .map((r) => normalize(r, platform))
      .filter((p) => p.text)
      .sort((a, b) => engagement(b) - engagement(a))
      .slice(0, limit);
    cacheSet(key, posts);
    return posts;
  } catch {
    return []; // never break a generation run on a scrape failure
  }
}
