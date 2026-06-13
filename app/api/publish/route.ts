// Publish one approved slot (or schedule it) to its platform via Zernio.
// The UI sends one of these per slot when the user approves, or all of them
// when they flip "auto-post the whole week".
import { NextRequest, NextResponse } from "next/server";
import { publish } from "@/lib/zernio";

export async function POST(req: NextRequest) {
  try {
    const { accountId, platform, text, mediaUrl, mediaType, scheduledFor } = await req.json();
    if (!accountId || !platform || !text)
      return NextResponse.json({ error: "accountId, platform, text required" }, { status: 400 });
    const result = await publish({ accountId, platform, text, mediaUrl, mediaType, scheduledFor });
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
