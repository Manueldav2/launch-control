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

// How each platform's dataset turns a competitor PROFILE URL into that profile's
// posts. Verified live (2026):
//   • collect  — the dataset takes the profile URL directly and returns its posts.
//                The IG dataset is a PROFILE dataset, so this is fast and correct.
//   • discover — type=discover_new&discover_by=profile_url. Required by a POSTS
//                dataset (e.g. the default X one) because it REJECTS a bare profile
//                URL (HTTP 400) and only crawls a profile's posts via discovery —
//                correct but SLOW (minutes), so it's opt-in, not the default.
// Env-overridable per platform (BRIGHT_DATA_<P>_MODE = collect|discover) so you can
// flip a dataset's mode, or point BRIGHT_DATA_<P>_DATASET at a profile/company-
// capable dataset, with no code change. Defaults stay fast: only enable `discover`
// if you've raised BRIGHT_DATA_MAX_POLL_MS to tolerate the latency.
// NOTE on the default datasets: the X dataset needs `discover` for profiles (slow);
// the LinkedIn one is a PEOPLE dataset that rejects /company/ pages (it wants /in/
// profiles). Instagram works out of the box. See docs/rubric.md + .env.example.
type CollectMode = "collect" | "discover";
const mode = (p: Platform): CollectMode =>
  (process.env[`BRIGHT_DATA_${p === "x" ? "X" : p === "instagram" ? "IG" : "LI"}_MODE`] as CollectMode) || "collect";

// Poll ceiling (ms) for a snapshot to become ready. Bounded so a slow collection
// times out gracefully instead of hanging a generation; raise it (env) if you turn
// on `discover` mode, which legitimately takes minutes.
const MAX_POLL_MS = Number(process.env.BRIGHT_DATA_MAX_POLL_MS) || 160000;

export interface CompetitorPost {
  platform: Platform;
  url: string;
  text: string; // the post copy — where the CTA we want to study lives
  likes: number;
  comments: number;
  shares: number; // reposts / retweets / shares (0 where the dataset omits it)
  author: string;
  // The post's lead image, when the dataset exposes one (IG especially). The
  // VISUAL critic uses it to compare our render against what wins visually;
  // optional because not every dataset/post carries a usable image URL.
  imageUrl?: string;
}

export function brightDataEnabled(): boolean {
  return !!process.env.BRIGHT_DATA_API_KEY;
}

// Which content platform a profile/post URL belongs to (null if not one we scrape).
// PURE + exported so URL routing is unit-tested offline. Used to send each
// competitor URL only to its OWN platform dataset instead of all three — cheap
// for hand-entered URLs, and load-bearing for auto-discovery, which can produce a
// dozen mixed URLs that would otherwise each be tried (and billed) on every dataset.
const PLATFORM_HOSTS: Record<Platform, RegExp> = {
  x: /^(x\.com|twitter\.com|mobile\.twitter\.com)$/i,
  instagram: /^instagram\.com$/i,
  linkedin: /^(linkedin\.com|[a-z]{2}\.linkedin\.com)$/i,
};
export function classifyPlatform(url: string): Platform | null {
  // Trim FIRST: the scheme test below is ^-anchored, so leading whitespace (a
  // stray space/newline inside a discovered JSON value) would otherwise defeat it,
  // get "https://" prepended, throw, and the URL would be silently dropped/misrouted.
  const u = (url || "").trim();
  if (!u) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./i, "");
    for (const p of Object.keys(PLATFORM_HOSTS) as Platform[]) if (PLATFORM_HOSTS[p].test(host)) return p;
    return null;
  } catch {
    return null;
  }
}

// Group a flat URL list by platform for routed scraping. Classified URLs go ONLY
// to their platform; an unrecognized (non-social) URL is tried on every platform,
// preserving the old "send everything everywhere" behavior for the rare case the
// classifier can't place it. PURE + exported for offline tests.
export function groupByPlatform(urls: string[]): Record<Platform, string[]> {
  const grouped: Record<Platform, string[]> = { x: [], instagram: [], linkedin: [] };
  const unclassified: string[] = [];
  for (const u of urls || []) {
    if (typeof u !== "string" || !u.trim()) continue;
    const p = classifyPlatform(u);
    if (p) grouped[p].push(u.trim());
    else unclassified.push(u.trim());
  }
  for (const p of Object.keys(grouped) as Platform[]) grouped[p].push(...unclassified);
  return grouped;
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

// Pull the first usable image URL off a record — datasets name it many ways
// (display_url, image_url, a photos[]/images[] array, …). Optional + tolerant:
// anything that isn't an http(s) string is ignored, so a missing/odd shape just
// yields no image rather than a bad one. The VISUAL critic uses this to compare
// our render against the competitor's actual visual.
function firstImage(rec: any): string | undefined {
  if (!rec) return undefined;
  const ok = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//i.test(v);
  for (const k of ["display_url", "image_url", "thumbnail", "thumbnail_src", "image", "photo", "media_url", "picture"]) {
    if (ok(rec[k])) return rec[k];
  }
  for (const k of ["photos", "images", "media", "display_resources", "displayResources"]) {
    const a = rec[k];
    if (!Array.isArray(a)) continue;
    for (const item of a) {
      if (ok(item)) return item;
      const u = item?.url || item?.src || item?.image_url || item?.display_url;
      if (ok(u)) return u;
    }
  }
  return undefined;
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
    imageUrl: firstImage(r),
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
      imageUrl: firstImage(p),
    })),
  // LinkedIn: one record = one PROFILE; recent posts live in `activity[]`, which
  // carries the post TEXT (`title`). Most activity records expose no per-post
  // engagement (so counts fall back to 0 and those posts can't be ranked), but we
  // still TRY the usual count fields via `num()` — harmless when absent, and it
  // recovers real ranking signal on the records that do carry reactions. Activity
  // can include reshares / likes-of-others, not only authored posts.
  linkedin: (r) =>
    (Array.isArray(r?.activity) ? r.activity : []).map((a: any) => ({
      platform: "linkedin" as const,
      url: a?.link || "",
      text: a?.title || "",
      likes: num(a, "num_likes", "likes", "reactions", "reaction_count", "num_reactions"),
      comments: num(a, "num_comments", "comments"),
      shares: num(a, "reposts", "shares", "num_shares"),
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

// The account a post belongs to, for de-domination: the author when present,
// else the profile HANDLE from its URL (the first path segment that isn't a
// structural keyword like status/p/company/in, so two posts from the same profile
// share a key even though their post ids differ). Lowercased so casing never splits.
const URL_STRUCTURAL = new Set(["p", "post", "posts", "reel", "reels", "status", "company", "in", "feed", "update", "pulse"]);
function accountKey(p: CompetitorPost): string {
  if (p.author && p.author.trim()) return p.author.trim().toLowerCase();
  try {
    const url = new URL(p.url);
    const handle = url.pathname.split("/").filter(Boolean).find((s) => !URL_STRUCTURAL.has(s.toLowerCase())) || "";
    return `${url.hostname.replace(/^www\./, "")}/${handle}`.toLowerCase();
  } catch {
    return (p.url || "").toLowerCase();
  }
}

// PURE, offline — keep at most `perAccount` posts from any one account, preserving
// input order (callers pass an engagement-sorted list). Stops ONE viral account
// from crowding the whole benchmark corpus so the critics compare against several
// competitors, not just the loudest. Exported for unit tests.
export function capPerAccount(posts: CompetitorPost[], perAccount: number): CompetitorPost[] {
  if (!(perAccount > 0)) return posts || [];
  const seen = new Map<string, number>();
  const out: CompetitorPost[] = [];
  for (const p of posts || []) {
    const k = accountKey(p);
    const n = seen.get(k) || 0;
    if (n >= perAccount) continue;
    seen.set(k, n + 1);
    out.push(p);
  }
  return out;
}

// --- network helpers ---

// Queue a collection for these profile/post URLs; returns the snapshot id. Body
// shape verified live: {"input":[{"url":...}, ...]} (NOT a bare array). In
// `discover` mode we add type=discover_new&discover_by=profile_url so a POSTS
// dataset will crawl each PROFILE's recent posts (a bare profile URL 400s there).
async function trigger(datasetId: string, urls: string[], m: CollectMode): Promise<string> {
  const disc = m === "discover" ? "&type=discover_new&discover_by=profile_url" : "";
  const r = await fetch(`${API}/trigger?dataset_id=${datasetId}&include_errors=true&notify=false${disc}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ input: urls.map((u) => ({ url: u })) }),
  });
  if (!r.ok) throw new Error(`bright-data trigger ${r.status}`);
  const j = await r.json();
  if (!j?.snapshot_id) throw new Error("bright-data: no snapshot_id");
  return j.snapshot_id as string;
}

// Bounded poll (MAX_POLL_MS ceiling) — collections take tens of seconds (we
// measured 6-94s); `discover` mode takes minutes. Times out rather than hang the
// request; the caller treats a timeout as "no intel" and proceeds.
async function awaitSnapshot(snapshotId: string, gapMs = 4000): Promise<void> {
  const tries = Math.max(1, Math.ceil(MAX_POLL_MS / gapMs));
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
  const m = mode(platform);

  const key = cacheKey(["bd-posts", platform, datasetId, m, urls, limit]);
  const cached = cacheGet<CompetitorPost[]>(key);
  if (cached) return cached;

  try {
    const snap = await trigger(datasetId, urls, m);
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
