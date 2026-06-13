// GET /api/posts?platform=x|linkedin|instagram  (or ?accountId=...)
// Returns the past posts published through Zernio for that platform's account,
// newest first, normalized for the channel UI. Empty array if none / unknown
// (the UI then falls back to the demo week). NOTE (cf5de2fb's lane): I added
// this as a new file to unblock the channels UI — the Zernio list endpoint is
// best-effort; correct the path if it differs and feel free to fold into
// lib/zernio.ts.
import { NextRequest, NextResponse } from "next/server";
import { resolveProfileId, listAccounts } from "@/lib/zernio";

const BASE = process.env.ZERNIO_BASE_URL || "https://zernio.com/api";
const TO_ZERNIO: Record<string, string> = { x: "twitter", linkedin: "linkedin", instagram: "instagram", facebook: "facebook", tiktok: "tiktok" };

function authHeaders(): Record<string, string> {
  const k = process.env.ZERNIO_API_KEY;
  if (!k) throw new Error("ZERNIO_API_KEY is not set");
  return { Authorization: `Bearer ${k}`, "Content-Type": "application/json" };
}

function pickMedia(p: any): { mediaUrl?: string; mediaType?: string } {
  const m = p.mediaItems?.[0] || p.media?.[0] || p.attachments?.[0];
  const url = m?.url || m?.mediaUrl || p.mediaUrl || p.imageUrl || undefined;
  const type = m?.type || (p.contentType?.includes("video") ? "video" : undefined) || (url && /\.(mp4|mov|webm)/i.test(url) ? "video" : url ? "image" : undefined);
  return { mediaUrl: url, mediaType: type };
}

function normalize(p: any, channel: string, accountId: string) {
  const { mediaUrl, mediaType } = pickMedia(p);
  return {
    id: String(p.id || p._id || p.postId || ""),
    platform: channel,
    accountId,
    text: p.text || p.content || p.caption || p.message || "",
    mediaUrl,
    mediaType,
    createdAt: p.createdAt || p.created_at || p.publishedAt || p.date || null,
    metrics: p.metrics || p.stats || p.insights || null,
  };
}

// Best-effort across the likely Zernio list shapes; first non-empty wins.
async function fetchPosts(profileId: string, accountId: string): Promise<any[]> {
  const tries = [
    `${BASE}/v1/posts?accountId=${encodeURIComponent(accountId)}`,
    `${BASE}/v1/posts?profileId=${encodeURIComponent(profileId)}&accountId=${encodeURIComponent(accountId)}`,
    `${BASE}/v1/posts?profileId=${encodeURIComponent(profileId)}`,
  ];
  for (const url of tries) {
    try {
      const r = await fetch(url, { headers: authHeaders() });
      if (!r.ok) continue;
      const j = await r.json();
      const arr = j.posts || j.data || (Array.isArray(j) ? j : []);
      if (Array.isArray(arr) && arr.length) return arr;
    } catch { /* try next */ }
  }
  return [];
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const platform = sp.get("platform") || "";
    let accountId = sp.get("accountId") || "";
    const profileId = await resolveProfileId();

    if (!accountId && platform) {
      const accounts = await listAccounts(profileId);
      const want = TO_ZERNIO[platform] || platform;
      const match = accounts.find((a: any) => (a.platform === want || a.channel === platform || a.channel === want));
      accountId = match?.accountId || match?.id || match?._id || "";
    }
    if (!accountId) return NextResponse.json({ posts: [] });

    const raw = await fetchPosts(profileId, accountId);
    const posts = raw
      .map((p) => normalize(p, platform || "x", accountId))
      .filter((p) => p.id)
      .sort((a, b) => (b.createdAt && a.createdAt ? +new Date(b.createdAt) - +new Date(a.createdAt) : 0));
    return NextResponse.json({ posts, accountId, profileId });
  } catch (e: any) {
    // Degrade quietly — the UI falls back to the demo week.
    return NextResponse.json({ posts: [], error: String(e?.message || e) });
  }
}
