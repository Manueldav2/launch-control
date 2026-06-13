// POST /api/review/:id/regenerate   { prompt?: string, intent?: string }
// The reviewer found a problem and sends an adjusted prompt. This re-renders via
// fal.ai (same branding/locale as the original), persists the new bytes, and
// inserts a child version at pending_review for the reviewer to judge again. The
// fal key + prompt logic stay here; the reviewer only sends the tweak.
import { NextRequest, NextResponse } from "next/server";
import { requestRegen } from "@/lib/media-pipeline";

export const maxDuration = 300;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const result = await requestRegen(id, { prompt: body?.prompt, intent: body?.intent });
    if (!result) return NextResponse.json({ error: "no DB, asset not found, or render failed" }, { status: 502 });
    return NextResponse.json({ ok: true, assetId: result.id, url: result.publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
