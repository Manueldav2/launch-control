// Persisted assets API. Backed by Supabase when configured; otherwise reports
// db:false so the client keeps using localStorage. The assets gallery can read
// here first and fall back to the browser store.
import { NextRequest, NextResponse } from "next/server";
import { saveAsset, listAssets, dbEnabled, type AssetRecord } from "@/lib/store";

export async function GET(req: NextRequest) {
  const org = req.nextUrl.searchParams.get("org") || "demo";
  return NextResponse.json({ db: dbEnabled(), assets: await listAssets(org) });
}

export async function POST(req: NextRequest) {
  try {
    const a = (await req.json()) as AssetRecord;
    if (!a?.url || !a?.content_type || !a?.platform)
      return NextResponse.json({ error: "url, content_type, platform required" }, { status: 400 });
    const saved = await saveAsset(a);
    return NextResponse.json({ db: dbEnabled(), saved });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
