// Render the image / UGC / motion video for one slot (cached + spend-guarded).
// Fires all three media types. Optional visual review (review=true) runs the
// multimodal critic over the render and returns its verdict.
import { NextRequest, NextResponse } from "next/server";
import { generateImage, generateVideo, spentSoFar } from "@/lib/fal";
import { critiqueVisual } from "@/lib/visual-critic";
import { enqueueForReview, dbEnabled } from "@/lib/store";

export const runtime = "nodejs"; // enqueue path uses node crypto + Storage upload
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contentType, prompt, imageUrl, brandColors, review, intent } = body;
    // Optional: after rendering, copy the asset into Supabase Storage and
    // enqueue a pending_review row for the image critic. Off by default so the
    // existing demo flow (return the render URL) is unchanged.
    const { enqueue, org, platform, day, caption, planId, slot, version, parentId, location } = body;
    const apiKey = req.headers.get("x-anthropic-key") || body.apiKey || undefined;
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

    // Bake the org's real brand colors into the render so the media looks like
    // THEM, not generic stock. (Colors come from the researched brand.)
    const colors: string[] = Array.isArray(brandColors) ? brandColors.slice(0, 3) : [];
    const palette = colors.length
      ? `\n\nBrand palette to feature naturally in the scene (signage, clothing, props, on-screen text), never as floating swatches: ${colors.join(", ")}.`
      : "";
    // "Vibe motion" direction for the launch/hype beat — kinetic, energetic.
    const motion = contentType === "motion_video"
      ? "\n\nMotion style: kinetic launch energy — punchy camera moves, quick reveals, hype-cut feel (hyperframes / vibe-motion). Bold and modern."
      : "";
    const branded = `${prompt}${palette}${motion}`;

    let url = "";
    let stillUrl = "";   // the keyframe behind a video — what the visual critic reviews
    if (contentType === "image") {
      url = await generateImage(branded);
      stillUrl = url;
    } else if (contentType === "ugc_video" || contentType === "motion_video") {
      // Ground the clip on a still first so it's on-brand and cheaper to direct.
      stillUrl = imageUrl || (await generateImage(branded));
      url = await generateVideo(branded, stillUrl);
    } else {
      return NextResponse.json({ error: `no media for contentType ${contentType}` }, { status: 400 });
    }

    // Optional visual review — the partner's review step turns this on.
    let visualGrade = null;
    if (review && stillUrl) {
      visualGrade = await critiqueVisual({
        imageUrl: stillUrl, intent: intent || prompt, brandColors: colors, apiKey,
      });
    }

    // Push it into the review queue (Storage upload + pending_review row).
    // The render is the expensive deliverable; queueing is best-effort metadata,
    // so a Storage/DB hiccup must NOT discard a successful (paid-for) render.
    let queued = null;
    let queueError: string | null = null;
    if (enqueue && url) {
      try {
        queued = await enqueueForReview({
          sourceUrl: url,
          posterUrl: contentType === "image" ? url : stillUrl, // the still the critic grades
          contentType,
          org, prompt, intent: intent || prompt,
          brandColors: colors,
          platform, day, caption, location, planId, slot, version, parentId,
        });
      } catch (e: any) {
        queueError = String(e?.message || e); // surfaced, not fatal — url still returned
      }
    }

    return NextResponse.json({ url, stillUrl, visualGrade, queued, queueError, db: dbEnabled(), spentUsd: spentSoFar() });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e), spentUsd: spentSoFar() }, { status: 500 });
  }
}
