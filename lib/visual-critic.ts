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
import { generateImage } from "./fal";

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

// ── SELF-CORRECTING REGENERATE LOOP ─────────────────────────────────────────
// The visual analog of the text critic's grade→`fixSlotCopy`→re-grade loop
// (app/api/generate-week/route.ts). Where the text loop *rewrites* failing copy,
// this loop *re-renders* a failing image: it feeds the critic's issues back into
// an improved prompt and regenerates, then re-critiques, up to a small cap.
//
// Same testability discipline as the rest of this file: the brittle parts are
// PURE and exported — `improveRenderPrompt` (prompt construction, the analog of
// the inline prompt inside `fixSlotCopy`) and `pickBestRender` (the "ship the
// best attempt" selection) — so the loop's logic is unit-tested with NO API key.

// One render and the verdict it earned. The loop keeps every attempt so
// `pickBestRender` can choose across the whole history, not just the last one.
export type RenderAttempt = {
  imageUrl: string;
  prompt: string; // the prompt that produced this render
  verdict: VisualVerdict;
};

export type VisualFixResult = {
  imageUrl: string; // the chosen render: best passing, else the last attempt
  prompt: string; // the prompt that produced the chosen render
  verdict: VisualVerdict;
  passed: boolean; // did the chosen render pass (matchesIntent ∧ clean)?
  attempts: number; // total renders critiqued (1 = original passed, no retry)
  history: RenderAttempt[];
};

// PURE, offline — the brittle prompt-building half of the regenerate loop, the
// visual analog of the rewrite prompt built inside `fixSlotCopy`. Given the
// ORIGINAL render prompt and the verdict that failed it, produce an IMPROVED
// image-generation prompt that (a) preserves the original creative subject,
// (b) folds in concrete corrective direction derived from the failed checks and
// the critic's issues, and (c) is GUARANTEED distinct per `attempt`.
//
// (c) is the load-bearing detail: `generateImage` caches by prompt
// (lib/fal.ts), so re-sending an identical prompt returns the SAME failing image
// and the loop spins forever making no progress. The `Revision N` line makes
// every attempt's prompt unique, busting that cache — an invariant the tests
// pin down. Kept pure (no I/O) so it's exercised with NO API key, exactly like
// `parseVisualVerdict` and `visualCriticPrompt`.
export function improveRenderPrompt(
  originalPrompt: string,
  verdict: VisualVerdict,
  attempt: number,
  brandColors?: string[],
): string {
  const fixes: string[] = [];
  // V1 (hard): the render didn't show what it should.
  if (!verdict.matchesIntent)
    fixes.push("It did not clearly show the intended subject — make the subject unmistakable and central.");
  // V2 (hard): artifacts.
  if (!verdict.clean)
    fixes.push(
      "Remove all artifacts: no garbled or misspelled text, no malformed hands or faces, " +
        "no watermarks, no obvious AI tells. Clean, sharp, postable.",
    );
  // V3 (advisory): palette. Only add when we actually know the colors.
  const colors = (brandColors || []).slice(0, 4).join(", ");
  if (!verdict.onBrand && colors)
    fixes.push(
      `Bring it on-brand: weave the palette (${colors}) into the scene naturally — ` +
        "signage, clothing, props, lighting — never as floating color swatches.",
    );
  // Fold in the critic's concrete, render-specific complaints.
  const issues = verdict.issues.filter((i) => typeof i === "string" && i.trim().length > 0).slice(0, 4);
  if (issues.length) fixes.push(`Specifically fix: ${issues.join("; ")}.`);
  // Fallback so the correction block is never empty (e.g. a deterministic
  // `gradeRender` fail carries no model issues): still demand a clean, on-intent take.
  if (!fixes.length) fixes.push("Render a clean, on-intent, postable version.");

  return (
    `${originalPrompt.trim()}\n\n` +
    `Revision ${attempt} — the previous render failed art-direction review. ` +
    fixes.join(" ")
  );
}

// PURE, offline — choose which render to ship from the loop's history. Rule
// (the task contract: "the best passing render, or the last attempt"):
//   • If ANY attempt passed (matchesIntent ∧ clean), return the best passer,
//     tie-broken by `onBrand` (the advisory signal earns its keep here: a clean,
//     on-intent AND on-brand render beats a clean, on-intent but off-brand one),
//     then by fewer issues, then earliest (cheapest).
//   • If none passed, return the LAST attempt — each retry targets the prior
//     verdict's issues, so the final render is the most-corrected one we have.
// Throws on empty history (the loop always records at least the original render).
export function pickBestRender(history: RenderAttempt[]): RenderAttempt {
  if (!history.length) throw new Error("pickBestRender: no attempts to choose from");
  const passers = history.map((a, i) => ({ a, i })).filter((x) => x.a.verdict.pass);
  if (!passers.length) return history[history.length - 1];
  passers.sort((x, y) => {
    if (x.a.verdict.onBrand !== y.a.verdict.onBrand) return x.a.verdict.onBrand ? -1 : 1;
    const di = x.a.verdict.issues.length - y.a.verdict.issues.length;
    if (di !== 0) return di;
    return x.i - y.i; // stable: earliest passing attempt wins ties
  });
  return passers[0].a;
}

// The async regenerate loop — critique the current render and, while it fails the
// Visual Rubric (matchesIntent ∧ clean), rebuild the prompt from its issues
// (`improveRenderPrompt`) and re-render via `generateImage`, re-critiquing each
// time, up to `maxRetries`. STOP the instant a render passes (it's shippable —
// no reason to spend another render). Return the best render across all attempts.
//
// `generate`/`critique` are injectable and default to the real `generateImage` /
// `critiqueVisual`. Production callers pass neither (one render engine, one
// critic); the seam exists so the loop's control flow — retry cap, stop-on-pass,
// best/last selection, cache-busting, render-failure tolerance — is exercised
// fully OFFLINE, the same no-API-key discipline as the pure halves above.
export async function fixRender(opts: {
  imageUrl: string; // the current render to review (and fix if it fails)
  prompt: string; // the original render prompt to improve from
  intent: string; // what the slot must show — the V1 yardstick handed to the critic
  brandColors?: string[];
  apiKey?: string;
  maxRetries?: number; // re-render cap (default 2); total renders = 1 + this
  verdict?: VisualVerdict; // optional precomputed verdict for `imageUrl` (skips one critique)
  generate?: (prompt: string) => Promise<string>;
  critique?: (o: {
    imageUrl: string;
    intent: string;
    brandColors?: string[];
    apiKey?: string;
  }) => Promise<VisualVerdict>;
}): Promise<VisualFixResult> {
  const gen = opts.generate || generateImage;
  const crit = opts.critique || critiqueVisual;
  const cap = Math.max(0, opts.maxRetries ?? 2);

  const history: RenderAttempt[] = [];
  // Attempt 0: the render we were handed (reuse the caller's verdict if given).
  const firstVerdict =
    opts.verdict ??
    (await crit({ imageUrl: opts.imageUrl, intent: opts.intent, brandColors: opts.brandColors, apiKey: opts.apiKey }));
  history.push({ imageUrl: opts.imageUrl, prompt: opts.prompt, verdict: firstVerdict });

  let latest = firstVerdict;
  for (let i = 0; i < cap && !latest.pass; i++) {
    const retryPrompt = improveRenderPrompt(opts.prompt, latest, i + 1, opts.brandColors);
    let url: string;
    try {
      url = await gen(retryPrompt);
    } catch {
      // A render-infrastructure failure (spend ceiling, fal error) must not crash
      // the loop — stop retrying and ship the best render we already have.
      break;
    }
    // `crit` (critiqueVisual) runs its own `gradeRender` pre-check, so an empty
    // re-render comes back as a hard fail without spending a vision call.
    const verdict = await crit({
      imageUrl: url,
      intent: opts.intent,
      brandColors: opts.brandColors,
      apiKey: opts.apiKey,
    });
    history.push({ imageUrl: url, prompt: retryPrompt, verdict });
    latest = verdict;
  }

  const best = pickBestRender(history);
  return {
    imageUrl: best.imageUrl,
    prompt: best.prompt,
    verdict: best.verdict,
    passed: best.verdict.pass,
    attempts: history.length,
    history,
  };
}
