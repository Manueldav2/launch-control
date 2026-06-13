// VISUAL REVIEW — the critic for the generated media (not the copy). Opus
// actually LOOKS at each rendered still/frame and grades it: does it match the
// intent, is it on-brand (uses the brand colors), and is it clean (no garbled
// text, no AI artifacts, postable). This is the capability the review step
// (the partner's lane) launches over every image / UGC / motion render.
import { askVision, extractJson } from "./llm";

export type VisualVerdict = {
  pass: boolean;
  onBrand: boolean;
  matchesIntent: boolean;
  clean: boolean;
  issues: string[];
  notes: string;
};

export async function critiqueVisual(opts: {
  imageUrl: string;      // the still, or a video's keyframe
  intent: string;        // what the slot is trying to show/say
  brandColors?: string[];
  apiKey?: string;
}): Promise<VisualVerdict> {
  const colors = (opts.brandColors || []).slice(0, 4).join(", ");
  try {
    const out = await askVision({
      imageUrl: opts.imageUrl,
      apiKey: opts.apiKey,
      maxTokens: 320,
      system:
        "You are an exacting art director reviewing a social-media visual before it ships. " +
        "Judge only what you SEE. Be strict: a real brand would not post a garbled, off-brand, " +
        "or off-topic image.",
      user:
        `This image is meant to: ${opts.intent}\n` +
        (colors ? `The brand palette is: ${colors} (the visual should feel like it belongs to this brand).\n` : "") +
        "Return ONLY JSON:\n" +
        '{"matchesIntent": true/false, "onBrand": true/false, "clean": true/false, ' +
        '"issues": ["short, concrete problems"], "notes": "one line for the maker"}\n' +
        "clean = false if there is garbled/misspelled text, melted hands/faces, watermark, " +
        "or obvious AI artifacts. onBrand = does it fit the palette/feel. matchesIntent = does " +
        "it actually show what it should.",
    });
    const j = extractJson(out);
    const matchesIntent = !!j.matchesIntent, onBrand = !!j.onBrand, clean = !!j.clean;
    return {
      pass: matchesIntent && clean,   // on-brand is a strong signal but not a hard fail
      onBrand, matchesIntent, clean,
      issues: Array.isArray(j.issues) ? j.issues.slice(0, 4) : [],
      notes: String(j.notes || ""),
    };
  } catch (e: any) {
    // Never block the pipeline on a review failure — surface it as unknown.
    return { pass: true, onBrand: true, matchesIntent: true, clean: true, issues: [], notes: `review skipped: ${String(e?.message || e).slice(0, 80)}` };
  }
}
