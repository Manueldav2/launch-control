// Render the image / UGC / motion video for one slot (cached + spend-guarded).
import { NextRequest, NextResponse } from "next/server";
import { generateImage, generateVideo, spentSoFar } from "@/lib/fal";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { contentType, prompt, imageUrl } = await req.json();
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

    let url = "";
    if (contentType === "image") {
      url = await generateImage(prompt);
    } else if (contentType === "ugc_video" || contentType === "motion_video") {
      // Ground the clip on a still first so it's on-brand and cheaper to direct.
      let still = imageUrl;
      if (!still) still = await generateImage(prompt);
      url = await generateVideo(prompt, still);
    } else {
      return NextResponse.json({ error: `no media for contentType ${contentType}` }, { status: 400 });
    }
    return NextResponse.json({ url, spentUsd: spentSoFar() });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e), spentUsd: spentSoFar() }, { status: 500 });
  }
}
