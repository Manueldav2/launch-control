// Turnkey channel connection. GET returns everything the UI needs in one call:
// the resolved Zernio profile, the already-connected channels, and a hosted
// OAuth connect URL per platform. POST {platform} returns a single connect URL.
import { NextRequest, NextResponse } from "next/server";
import { resolveProfileId, connectedChannels, connectUrl } from "@/lib/zernio";
import { getCachedFresh, setCached } from "@/lib/demo-cache";

const PLATFORMS = ["x", "linkedin", "instagram", "tiktok"] as const;
const CONNECT_TTL_MS = 5 * 60 * 1000; // sidebar/channels load instantly within this window

export async function GET(req: NextRequest) {
  try {
    // Serve the cached channel/sidebar payload so it loads instantly (no Zernio
    // round-trip). ?fresh=1 forces a refresh (e.g. right after connecting one).
    if (req.nextUrl.searchParams.get("fresh") !== "1") {
      const hit = await getCachedFresh<Record<string, unknown>>("connect:v1", CONNECT_TTL_MS);
      if (hit) return NextResponse.json({ ...hit, cached: true });
    }
    const profileId = await resolveProfileId();
    const redirect = `${process.env.PUBLIC_BASE_URL || req.nextUrl.origin}/?connected=1`;
    const [accounts, ...urls] = await Promise.all([
      connectedChannels(profileId),
      ...PLATFORMS.map((p) => connectUrl(p, profileId, redirect).catch(() => "")),
    ]);
    const connect: Record<string, string> = {};
    PLATFORMS.forEach((p, i) => { connect[p] = urls[i]; });
    const payload = { profileId, accounts, connect };
    await setCached("connect:v1", payload);
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { platform, redirectUrl } = await req.json();
    if (!platform) return NextResponse.json({ error: "platform required" }, { status: 400 });
    const profileId = await resolveProfileId();
    const url = await connectUrl(platform, profileId,
      redirectUrl || `${process.env.PUBLIC_BASE_URL || req.nextUrl.origin}/?connected=${platform}`);
    return NextResponse.json({ url, profileId });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
