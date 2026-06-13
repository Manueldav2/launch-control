// Fallback visual reviewer (Opus). The partner's review process is powered by
// Bright Data; if that ever fails, this endpoint always returns a verdict — Opus
// LOOKS at the rendered still/frame and grades intent / on-brand / clean.
//   POST { url | imageUrl | posterUrl, intent?, brandColors? } -> { ok, verdict, reviewer }
// critiqueVisual itself never throws (it degrades to a non-blocking verdict), so
// this is a safe always-on backstop the pipeline can call when Bright Data errors.
import { NextRequest, NextResponse } from "next/server";
import { critiqueVisual } from "@/lib/visual-critic";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const imageUrl = b.imageUrl || b.url || b.posterUrl || b.stillUrl;
    if (!imageUrl) return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
    const apiKey = req.headers.get("x-anthropic-key") || b.apiKey || undefined;
    const verdict = await critiqueVisual({
      imageUrl,
      intent: b.intent || b.prompt || b.caption || "an on-brand social post visual",
      brandColors: Array.isArray(b.brandColors) ? b.brandColors : undefined,
      apiKey,
    });
    return NextResponse.json({ ok: true, verdict, reviewer: "opus-visual-critic" });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
