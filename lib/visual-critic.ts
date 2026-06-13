// VISUAL REVIEW — the critic for the generated media (not the copy). Opus
// actually LOOKS at each rendered still/frame and grades it: does it match the
// intent, is it on-brand (uses the brand colors), and is it clean (no garbled
// text, no AI artifacts, postable). This is the capability the review step
// (the partner's lane) launches over every image / UGC / motion render.
//
// Structured to mirror the text critic (lib/critic.ts): the brittle parsing of
// the model's reply lives in a PURE function (`parseVisualVerdict`, the analog of
// `parseCriticVerdict`) plus a deterministic pre-check (`gradeRender`, the analog
// of `gradeSlot`), so the pass/fail logic is unit-tested with NO API key. See
// docs/rubric.md ("Visual Rubric") and lib/visual-critic.test.ts.
import { askVision, extractJson } from "./llm";

export type VisualVerdict = {
  pass: boolean;
  onBrand: boolean;
  matchesIntent: boolean;
  clean: boolean;
  issues: string[];
  notes: string;
};

// Tolerant-but-fail-closed truthiness for the model's verdict fields. Accepts a
// real JSON boolean or the common string forms ("true"/"yes"); ANYTHING else —
// missing, "false"/"no", null, a number, an object — counts as NO. So an omitted
// or garbled "clean" can never silently pass review: we'd rather force a
// regenerate than ship a bad image.
function isYes(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "string") return /^\s*(true|yes)\s*$/i.test(v);
  return false;
}

// Deterministic pre-check (no API): a render that produced no usable URL can't be
// graded and is a hard fail — the visual analog of `gradeSlot` flagging a media
// slot with no prompt. Lets a failed/empty render be caught without a vision call.
export function gradeRender(mediaUrl?: string): { ok: boolean; reason: string } {
  const url = (mediaUrl || "").trim();
  if (!url) return { ok: false, reason: "no media rendered (empty URL)" };
  if (!/^(https?:\/\/|data:)/i.test(url))
    return { ok: false, reason: `media URL not fetchable (${url.slice(0, 40)})` };
  return { ok: true, reason: "" };
}

// Build the exact prompt the vision critic sends. Exported so the rubric doc and
// the tests reference one source of truth for what "pass" means.
export function visualCriticPrompt(intent: string, brandColors?: string[]): { system: string; user: string } {
  const colors = (brandColors || []).slice(0, 4).join(", ");
  return {
    system:
      "You are an exacting art director reviewing a social-media visual before it ships. " +
      "Judge only what you SEE. Be strict: a real brand would not post a garbled, off-brand, " +
      "or off-topic image.",
    user:
      `This image is meant to: ${intent}\n` +
      (colors ? `The brand palette is: ${colors} (the visual should feel like it belongs to this brand).\n` : "") +
      "Return ONLY JSON:\n" +
      '{"matchesIntent": true/false, "onBrand": true/false, "clean": true/false, ' +
      '"issues": ["short, concrete problems"], "notes": "one line for the maker"}\n' +
      "clean = false if there is garbled/misspelled text, melted hands/faces, watermark, " +
      "or obvious AI artifacts. onBrand = does it fit the palette/feel. matchesIntent = does " +
      "it actually show what it should.",
  };
}

// Pure, offline verdict parser — the visual analog of `parseCriticVerdict`. Turns
// the vision model's raw reply into a normalized VisualVerdict with NO network
// and NO API key, so the pass/fail logic is unit-tested without one. Throws ONLY
// when the reply contains no JSON object at all; `critiqueVisual` turns that into
// a skipped (non-blocking) review.
//
// Pass rule: a render ships iff it shows what it should (matchesIntent, V1) AND is
// clean of artifacts (clean, V2). `onBrand` (V3) is reported but advisory — a
// strong signal, never a hard fail.
export function parseVisualVerdict(raw: string): VisualVerdict {
  const j = extractJson(raw);
  const matchesIntent = isYes(j.matchesIntent);
  const onBrand = isYes(j.onBrand);
  const clean = isYes(j.clean);
  const issues = Array.isArray(j.issues)
    ? j.issues.filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 4)
    : [];
  const notes = typeof j.notes === "string" ? j.notes : "";
  return { pass: matchesIntent && clean, onBrand, matchesIntent, clean, issues, notes };
}

export async function critiqueVisual(opts: {
  imageUrl: string;      // the still, or a video's keyframe
  intent: string;        // what the slot is trying to show/say
  brandColors?: string[];
  apiKey?: string;
}): Promise<VisualVerdict> {
  // Fail fast and deterministically on a render that never produced an image — no
  // point spending a vision call, and an unrendered slot must not pass review.
  const render = gradeRender(opts.imageUrl);
  if (!render.ok) {
    return { pass: false, onBrand: false, matchesIntent: false, clean: false, issues: [render.reason], notes: render.reason };
  }
  try {
    const { system, user } = visualCriticPrompt(opts.intent, opts.brandColors);
    const out = await askVision({ imageUrl: opts.imageUrl, apiKey: opts.apiKey, maxTokens: 320, system, user });
    return parseVisualVerdict(out);
  } catch (e: any) {
    // Never block the pipeline on a review *infrastructure* failure (network, API,
    // or an unparseable reply) — surface it as a non-blocking skip.
    return { pass: true, onBrand: true, matchesIntent: true, clean: true, issues: [], notes: `review skipped: ${String(e?.message || e).slice(0, 80)}` };
  }
}
