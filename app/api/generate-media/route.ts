// Render the image / UGC / motion video for one slot (cached + spend-guarded),
// then hand it to the review pipeline: persist the bytes to Supabase Storage and
// enqueue a pending_review asset. The optional inline visual critic (review=true)
// still runs the multimodal grader over the render and returns its verdict.
import { NextRequest, NextResponse } from "next/server";
import { renderMedia } from "@/lib/media-gen";
import { spentSoFar } from "@/lib/fal";
import { critiqueVisual } from "@/lib/visual-critic";
import { enqueueAsset } from "@/lib/media-pipeline";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      contentType, prompt, imageUrl, brandColors, review, intent, location,
      // slot context — lets the queued asset tie back to the WeekPlan slot and
      // regenerate on-brand. All optional; defaults keep older callers working.
      org, planId, slot, day, platform, brand, caption,
    } = body;
    const apiKey = req.headers.get("x-anthropic-key") || body.apiKey || undefined;
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

    const colors: string[] = Array.isArray(brandColors) ? brandColors.slice(0, 3) : [];

    // ONE render path (lib/media-gen): branded prompt + fal. Identical for the
    // first cut and every regeneration, so nothing drifts on regen.
    let url = "";
    let stillUrl = "";
    try {
      ({ url, stillUrl } = await renderMedia({ contentType, prompt, intent, brandColors: colors, location, imageUrl }));
    } catch (e: any) {
      const msg = String(e?.message || e);
      const status = msg.startsWith("no media for") ? 400 : 500;
      return NextResponse.json({ error: msg, spentUsd: spentSoFar() }, { status });
    }

    // Hand off to the review pipeline: copy bytes to Supabase Storage + enqueue a
    // pending_review asset the partner's reviewer claims. No DB → no-op, the fal
    // url is returned as-is.
    const queued = await enqueueAsset({
      url, contentType, org, platform, day, brand, caption, slot, planId,
      prompt, intent, brandColors: colors, location, posterUrl: stillUrl,
    });

    // Optional inline visual review (the existing review=true hook).
    let visualGrade = null;
    if (review && stillUrl) {
      visualGrade = await critiqueVisual({ imageUrl: stillUrl, intent: intent || prompt, brandColors: colors, apiKey });
    }

    return NextResponse.json({
      url: queued.publicUrl,   // permanent Supabase url when persisted, else the fal url
      sourceUrl: url,
      stillUrl,
      assetId: queued.id,
      queued: !!queued.id,
      persisted: queued.persisted,
      visualGrade,
      spentUsd: spentSoFar(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e), spentUsd: spentSoFar() }, { status: 500 });
  }
}
