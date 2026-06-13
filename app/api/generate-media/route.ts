// Render the image / UGC / motion video for one slot (cached + spend-guarded),
// then hand it to the review pipeline: persist the bytes to Supabase Storage and
// enqueue a pending_review asset. Generation is gated on sign-in, and media has a
// FREE-TIER QUOTA per account (1 image + 1 video by default; text generation is
// unlimited and lives in /api/generate-week). The optional inline visual critic
// (review=true) still runs the multimodal grader over the render.
import { NextRequest, NextResponse } from "next/server";
import { renderMedia } from "@/lib/media-gen";
import { spentSoFar } from "@/lib/fal";
import { critiqueVisual } from "@/lib/visual-critic";
import { enqueueAsset } from "@/lib/media-pipeline";
import { userIdFromRequest } from "@/lib/auth-server";
import { runWithKeys } from "@/lib/request-keys";
import { db } from "@/lib/store";

export const maxDuration = 300;

const FREE_IMAGES = parseInt(process.env.FREE_IMAGES || "1", 10);
const FREE_VIDEOS = parseInt(process.env.FREE_VIDEOS || "1", 10);

export async function POST(req: NextRequest) {
  try {
    // Gate on sign-in.
    const userId = await userIdFromRequest(req);
    if (!userId) return NextResponse.json({ error: "Create a free account to generate media." }, { status: 401 });

    const body = await req.json();
    const {
      contentType, prompt, imageUrl, brandColors, review, intent, location,
      org, planId, slot, day, platform, brand, caption,
    } = body;
    const apiKey = req.headers.get("x-anthropic-key") || body.apiKey || undefined;
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

    // Bring-your-own fal.ai key: when present, the render runs on the user's key
    // and the free-tier quota does not apply (they pay for their own renders).
    const userFalKey = (req.headers.get("x-fal-key") || body.falKey || "").trim();
    const usingOwnKey = !!userFalKey;

    const isVideo = contentType === "ugc_video" || contentType === "motion_video";

    // Free-tier quota: read this account's usage and stop at the free limit —
    // unless they brought their own key.
    const c = db();
    let used = { images: 0, videos: 0 };
    if (c) {
      const { data } = await c.from("usage").select("images,videos").eq("user_id", userId).maybeSingle();
      if (data) used = data as { images: number; videos: number };
    }
    if (!usingOwnKey) {
      if (isVideo && used.videos >= FREE_VIDEOS)
        return NextResponse.json({ error: `Your free plan includes ${FREE_VIDEOS} video render, and it's used. Add your own fal.ai key to keep rendering. Plain text and planning stay free.`, quota: { kind: "video", used: used.videos, limit: FREE_VIDEOS, canUseOwnKey: true } }, { status: 402 });
      if (!isVideo && used.images >= FREE_IMAGES)
        return NextResponse.json({ error: `Your free plan includes ${FREE_IMAGES} image render, and it's used. Add your own fal.ai key to keep rendering. Plain text and planning stay free.`, quota: { kind: "image", used: used.images, limit: FREE_IMAGES, canUseOwnKey: true } }, { status: 402 });
    }

    const colors: string[] = Array.isArray(brandColors) ? brandColors.slice(0, 3) : [];

    // ONE render path (lib/media-gen): branded prompt + fal. Identical for the
    // first cut and every regeneration, so nothing drifts on regen. If the user
    // brought a key, run the render inside its key context (lib/request-keys).
    let url = "";
    let stillUrl = "";
    const doRender = () => renderMedia({ contentType, prompt, intent, brandColors: colors, location, imageUrl });
    try {
      ({ url, stillUrl } = usingOwnKey ? await runWithKeys({ FAL_KEY: userFalKey }, doRender) : await doRender());
    } catch (e: any) {
      const msg = String(e?.message || e);
      const status = msg.startsWith("no media for") ? 400 : 500;
      return NextResponse.json({ error: usingOwnKey ? `Render failed on your fal.ai key: ${msg}` : msg, spentUsd: spentSoFar() }, { status });
    }

    // Count free-tier renders only (own-key renders are on the user's account).
    if (!usingOwnKey && c) {
      await c.from("usage").upsert(
        { user_id: userId, images: used.images + (isVideo ? 0 : 1), videos: used.videos + (isVideo ? 1 : 0), updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    }

    // Hand off to the review pipeline: copy bytes to Supabase Storage + enqueue a
    // pending_review asset the partner's reviewer claims. No DB → no-op, the fal
    // url is returned as-is.
    const queued = await enqueueAsset({
      url, contentType, org: org || userId, platform, day, brand, caption, slot, planId,
      prompt, intent, brandColors: colors, location, posterUrl: stillUrl,
    });

    // Optional inline visual review (the existing review=true hook).
    let visualGrade = null;
    if (review && stillUrl) {
      visualGrade = await critiqueVisual({ imageUrl: stillUrl, intent: intent || prompt, brandColors: colors, apiKey });
    }

    return NextResponse.json({
      url: queued.publicUrl,
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
