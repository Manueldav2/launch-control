// ONE creation path. The branded-prompt logic + fal render used by BOTH the
// first cut (app/api/generate-media) and every regeneration (lib/media-pipeline
// → /api/review/:id/regenerate), so a regenerated asset is branded identically
// to the original. Keeping this in one place is why regen never drifts.
import { generateImage, generateVideo } from "./fal";

export interface RenderInput {
  contentType: string;        // image | ugc_video | motion_video
  prompt: string;             // the slot's media prompt
  intent?: string;
  brandColors?: string[];
  location?: string;
  imageUrl?: string;          // optional still to ground a video on
}

const NON_LOCATIONS = ["na", "n/a", "none", "online"];

// Bake brand palette + motion direction + locale into the raw prompt. This is
// lifted verbatim from the generate-media route so behavior is unchanged.
export function brandPrompt(i: RenderInput): string {
  const colors = (i.brandColors || []).slice(0, 3);
  const palette = colors.length
    ? `\n\nBrand palette to feature naturally in the scene (signage, clothing, props, on-screen text), never as floating swatches: ${colors.join(", ")}.`
    : "";
  const motion = i.contentType === "motion_video"
    ? "\n\nMotion style: kinetic launch energy — punchy camera moves, quick reveals, hype-cut feel (hyperframes / vibe-motion). Bold and modern."
    : "";
  const locClean = (i.location || "").trim();
  const loc = locClean && !NON_LOCATIONS.includes(locClean.toLowerCase())
    ? `\n\nLocation: set the scene in or around ${locClean} — a recognizable local setting with real locals, the actual kind of place this happens. Make a nearby viewer think "that's here."`
    : "";
  return `${i.prompt}${palette}${motion}${loc}`;
}

// Render one slot. Returns the playable url + the keyframe still behind it
// (what the visual critic looks at). For video, grounds on a still first.
export async function renderMedia(i: RenderInput): Promise<{ url: string; stillUrl: string }> {
  const branded = brandPrompt(i);
  if (i.contentType === "image") {
    const url = await generateImage(branded);
    return { url, stillUrl: url };
  }
  if (i.contentType === "ugc_video" || i.contentType === "motion_video") {
    const stillUrl = i.imageUrl || (await generateImage(branded));
    const url = await generateVideo(branded, stillUrl);
    return { url, stillUrl };
  }
  throw new Error(`no media for contentType ${i.contentType}`);
}
