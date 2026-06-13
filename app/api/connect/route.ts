// Turnkey channel connection. GET returns everything the UI needs in one call:
// the resolved Zernio profile, the already-connected channels, and a hosted
// OAuth connect URL per platform. POST {platform} returns a single connect URL.
import { NextRequest, NextResponse } from "next/server";
import { resolveProfileId, connectedChannels, connectUrl } from "@/lib/zernio";

const PLATFORMS = ["x", "linkedin", "instagram", "tiktok"] as const;

export async function GET(req: NextRequest) {
  try {
    const profileId = await resolveProfileId();
    const redirect = `${process.env.PUBLIC_BASE_URL || req.nextUrl.origin}/?connected=1`;
    const [accounts, ...urls] = await Promise.all([
      connectedChannels(profileId),
      ...PLATFORMS.map((p) => connectUrl(p, profileId, redirect).catch(() => "")),
    ]);
    const connect: Record<string, string> = {};
    PLATFORMS.forEach((p, i) => { connect[p] = urls[i]; });
    return NextResponse.json({ profileId, accounts, connect });
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
