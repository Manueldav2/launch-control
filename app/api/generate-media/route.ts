// Render the image / UGC / motion video for one slot (cached + spend-guarded).
// Fires all three media types. Optional visual review (review=true) runs the
// multimodal critic over the render and returns its verdict.
import { NextRequest, NextResponse } from "next/server";
import { generateImage, generateVideo, spentSoFar } from "@/lib/fal";
import { critiqueVisual } from "@/lib/visual-critic";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contentType, prompt, imageUrl, brandColors, review, intent, location } = body;
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
    // For in-person events, ground the scene in the real locale so it pulls the
    // LOCAL audience (recognizable setting + locals), never generic stock.
    const loc = typeof location === "string" && location.trim() &&
      !["na", "n/a", "none", "online"].includes(location.trim().toLowerCase())
      ? `\n\nLocation: set the scene in or around ${location.trim()} — a recognizable local setting with real locals, the actual kind of place this happens. Make a nearby viewer think "that's here."`
      : "";
    const branded = `${prompt}${palette}${motion}${loc}`;

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

    return NextResponse.json({ url, stillUrl, visualGrade, spentUsd: spentSoFar() });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e), spentUsd: spentSoFar() }, { status: 500 });
  }
}
