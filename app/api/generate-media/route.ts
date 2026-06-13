// Render the image / UGC / motion video for one slot (cached + spend-guarded).
import { NextRequest, NextResponse } from "next/server";
import { generateImage, generateVideo, spentSoFar } from "@/lib/fal";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { contentType, prompt, imageUrl, brandColors } = await req.json();
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

    // Bake the org's real brand colors into the render so the media looks like
    // THEM, not generic stock. (Colors come from the researched brand.)
    const colors: string[] = Array.isArray(brandColors) ? brandColors.slice(0, 3) : [];
    const branded = colors.length
      ? `${prompt}\n\nBrand palette to feature naturally in the scene (signage, clothing, props, on-screen text), never as floating swatches: ${colors.join(", ")}.`
      : prompt;

    let url = "";
    if (contentType === "image") {
      url = await generateImage(branded);
    } else if (contentType === "ugc_video" || contentType === "motion_video") {
      // Ground the clip on a still first so it's on-brand and cheaper to direct.
      let still = imageUrl;
      if (!still) still = await generateImage(branded);
      url = await generateVideo(branded, still);
    } else {
      return NextResponse.json({ error: `no media for contentType ${contentType}` }, { status: 400 });
    }
    return NextResponse.json({ url, spentUsd: spentSoFar() });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e), spentUsd: spentSoFar() }, { status: 500 });
  }
}
