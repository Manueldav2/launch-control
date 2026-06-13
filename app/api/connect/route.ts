// Hand back a Zernio hosted-OAuth link so the user can connect one platform.
import { NextRequest, NextResponse } from "next/server";
import { connectUrl, listAccounts } from "@/lib/zernio";

export async function GET(req: NextRequest) {
  try {
    const profileId = req.nextUrl.searchParams.get("profileId") || "";
    if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });
    return NextResponse.json({ accounts: await listAccounts(profileId) });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { platform, profileId, redirectUrl } = await req.json();
    if (!platform || !profileId) return NextResponse.json({ error: "platform + profileId required" }, { status: 400 });
    const url = await connectUrl(platform, profileId,
      redirectUrl || `${process.env.PUBLIC_BASE_URL || ""}/?connected=${platform}`);
    return NextResponse.json({ url });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
