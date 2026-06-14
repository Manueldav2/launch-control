// Self-test for the VISUAL critic. Pure, deterministic, NO API key needed (it
// never calls the vision model — it exercises parseVisualVerdict + gradeRender).
// The image analog of lib/critic.test.ts: each case is a known visual-verdict
// rule that must hold, so a regression in the pass logic fails the build.
//
// Run:  npx tsx --test lib/visual-critic.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVisualVerdict, gradeRender, improveRenderPrompt, pickBestRender, fixRender, buildVisualComparePrompt, competitiveRenderPrompt, wasReviewSkipped, compareVisualToCompetitors } from "./visual-critic";
import type { VisualVerdict, RenderAttempt } from "./visual-critic";
import type { CompetitorPost } from "./bright-data";

// A reply is just the JSON the vision model is told to return.
const reply = (o: Record<string, unknown>) => JSON.stringify(o);

// Pass rule: matchesIntent && clean. on-brand is advisory (never a hard fail).
test("V1∧V2 — matches intent and clean passes", () => {
  const v = parseVisualVerdict(reply({ matchesIntent: true, onBrand: true, clean: true, issues: [], notes: "great" }));
  assert.equal(v.pass, true);
  assert.deepEqual(v.issues, []);
});

test("V3 — off-brand alone does NOT fail (onBrand is advisory)", () => {
  const v = parseVisualVerdict(reply({ matchesIntent: true, onBrand: false, clean: true, issues: ["palette is off"] }));
  assert.equal(v.pass, true);
  assert.equal(v.onBrand, false);
});

test("V2 — not clean fails (artifacts / garbled text are a hard fail)", () => {
  const v = parseVisualVerdict(reply({ matchesIntent: true, onBrand: true, clean: false, issues: ["garbled text"] }));
  assert.equal(v.pass, false);
});

test("V1 — off-intent fails", () => {
  const v = parseVisualVerdict(reply({ matchesIntent: false, onBrand: true, clean: true, issues: [] }));
  assert.equal(v.pass, false);
});

// fail-closed: a missing / ambiguous field counts as NO and must never pass.
test("a missing 'clean' field fails closed (a broken review can't ship junk)", () => {
  const v = parseVisualVerdict(reply({ matchesIntent: true, onBrand: true /* clean omitted */, issues: [] }));
  assert.equal(v.clean, false);
  assert.equal(v.pass, false);
});

test("tolerates string booleans ('true'/'yes'), rejects every other shape", () => {
  const v = parseVisualVerdict(reply({ matchesIntent: "true", onBrand: "no", clean: "YES", issues: [] }));
  assert.equal(v.matchesIntent, true);
  assert.equal(v.clean, true);
  assert.equal(v.onBrand, false);
  assert.equal(v.pass, true);
  // truthy-but-not-a-yes values (1, {}) are NOT yes — fail-closed.
  const w = parseVisualVerdict(reply({ matchesIntent: 1, clean: {}, onBrand: true }));
  assert.equal(w.matchesIntent, false);
  assert.equal(w.clean, false);
  assert.equal(w.pass, false);
});

test("extracts JSON embedded in prose and clamps issues to 4", () => {
  const v = parseVisualVerdict(
    'Here is my review:\n{"matchesIntent": true, "clean": false, "onBrand": true, ' +
      '"issues": ["a","b","c","d","e","f"], "notes": "too many"}\nThanks!',
  );
  assert.equal(v.pass, false);
  assert.equal(v.issues.length, 4);
  // non-string / blank issues are dropped, not rendered as empty bullets.
  const w = parseVisualVerdict(reply({ matchesIntent: true, clean: true, issues: ["real", "", 5, null, "  "] }));
  assert.deepEqual(w.issues, ["real"]);
});

test("throws on a reply with no JSON (critiqueVisual turns this into a skip)", () => {
  assert.throws(() => parseVisualVerdict("I cannot review this image."));
});

// gradeRender — deterministic, no model: an empty / unfetchable render is a hard
// fail before any vision call is spent.
test("gradeRender flags an empty or unfetchable render URL", () => {
  assert.equal(gradeRender("").ok, false);
  assert.equal(gradeRender("   ").ok, false);
  assert.equal(gradeRender("not-a-url").ok, false);
  assert.equal(gradeRender("https://cdn.fal.ai/abc.png").ok, true);
  assert.equal(gradeRender("data:image/png;base64,iVBOR").ok, true);
});

// ── REGENERATE LOOP — the visual analog of fixSlotCopy ───────────────────────
// All offline: improveRenderPrompt + pickBestRender are pure; fixRender's loop is
// driven by injected generate/critique stubs, so NOTHING here touches the network
// or needs an API key — same discipline as the parser tests above.

// Build a VisualVerdict. `pass` is always derived (matchesIntent ∧ clean) so a
// test can never construct an impossible verdict — it mirrors parseVisualVerdict.
const V = (over: Partial<VisualVerdict> = {}): VisualVerdict => {
  const matchesIntent = over.matchesIntent ?? true;
  const clean = over.clean ?? true;
  return {
    pass: matchesIntent && clean,
    matchesIntent,
    clean,
    onBrand: over.onBrand ?? true,
    issues: over.issues ?? [],
    notes: over.notes ?? "",
  };
};
const A = (imageUrl: string, v: VisualVerdict): RenderAttempt => ({ imageUrl, prompt: `p:${imageUrl}`, verdict: v });

// improveRenderPrompt (PURE) — the brittle prompt-building half.
test("improveRenderPrompt keeps the subject and adds intent + clean direction on hard fails", () => {
  const p = improveRenderPrompt("sunrise over a clean beach, volunteers", V({ matchesIntent: false, clean: false }), 1);
  assert.ok(p.includes("sunrise over a clean beach, volunteers"), "preserves the original subject");
  assert.ok(/subject/i.test(p), "adds matches-intent direction");
  assert.ok(/artifact|garbled/i.test(p), "adds clean-up direction");
});

test("improveRenderPrompt adds palette direction only when off-brand AND colors are known", () => {
  const off = improveRenderPrompt("a beach", V({ onBrand: false, matchesIntent: false }), 1, ["#0af", "#fc0"]);
  assert.ok(off.includes("#0af") && off.includes("#fc0"), "off-brand + colors → palette woven in");
  const onBrand = improveRenderPrompt("a beach", V({ onBrand: true, matchesIntent: false }), 1, ["#0af"]);
  assert.ok(!onBrand.includes("#0af"), "on-brand → no palette nag");
  const noColors = improveRenderPrompt("a beach", V({ onBrand: false, matchesIntent: false }), 1);
  assert.ok(!/palette/i.test(noColors), "off-brand but no colors → nothing to say about palette");
});

test("improveRenderPrompt folds the critic's concrete issues into the retry prompt", () => {
  const p = improveRenderPrompt("a beach", V({ clean: false, issues: ["garbled text on the sign", "six fingers"] }), 1);
  assert.ok(p.includes("garbled text on the sign") && p.includes("six fingers"));
});

// THE load-bearing invariant: distinct prompt per attempt, else generateImage's
// prompt-keyed cache hands back the same failing image and the loop never converges.
test("improveRenderPrompt is distinct per attempt (busts the prompt-keyed render cache)", () => {
  const v = V({ clean: false, issues: ["garbled text"] });
  const a1 = improveRenderPrompt("a beach", v, 1);
  const a2 = improveRenderPrompt("a beach", v, 2);
  assert.notEqual(a1, a2, "same verdict, different attempt → different prompt");
  assert.ok(a1.includes("Revision 1") && a2.includes("Revision 2"));
});

test("improveRenderPrompt never emits an empty correction (defensive fallback)", () => {
  // A verdict with no actionable detail still yields a non-empty, on-intent revision,
  // so the loop never feeds generateImage a bare original (which would cache-hit).
  const p = improveRenderPrompt("a beach", V({ matchesIntent: true, clean: true, onBrand: true, issues: [] }), 1);
  assert.ok(p.includes("a beach"));
  assert.ok(/clean, on-intent/i.test(p));
});

// ── COMPETITIVE VISUAL COMPARISON (Bright Data critic) ───────────────────────
// competitiveRenderPrompt (PURE) — strengthens a PASSING render against peers,
// framed as "already passed", NOT as "previous render failed" (improveRenderPrompt).
test("competitiveRenderPrompt keeps the subject, folds suggestions, and is NOT failure-framed", () => {
  const p = competitiveRenderPrompt("sunrise over a clean beach", 2, ["faces front and center", "brighter outdoor light"]);
  assert.ok(p.includes("sunrise over a clean beach"), "preserves the original subject");
  assert.ok(p.includes("faces front and center") && p.includes("brighter outdoor light"), "weaves in competitive direction");
  assert.ok(/out-perform/i.test(p) && /already passed/i.test(p), "framed as strengthening a passing render");
  assert.ok(!/the previous render failed/i.test(p), "does NOT borrow improveRenderPrompt's failure framing");
});

test("competitiveRenderPrompt is distinct per attempt (busts the fal prompt cache)", () => {
  const a = competitiveRenderPrompt("a beach", 1, ["x"]);
  const b = competitiveRenderPrompt("a beach", 2, ["x"]);
  assert.notEqual(a, b);
  assert.ok(a.includes("Revision 1") && b.includes("Revision 2"));
});

test("competitiveRenderPrompt weaves the palette only when off-brand, and never emits an empty direction", () => {
  const off = competitiveRenderPrompt("a beach", 1, ["punchier light"], ["#0af", "#fc0"], true);
  assert.ok(off.includes("#0af") && off.includes("#fc0"), "off-brand → palette woven in");
  const on = competitiveRenderPrompt("a beach", 1, ["punchier light"], ["#0af"], false);
  assert.ok(!on.includes("#0af"), "on-brand → no palette nag");
  const noSuggestions = competitiveRenderPrompt("a beach", 1, []);
  assert.ok(/stops the scroll/i.test(noSuggestions), "empty suggestions still yields a concrete direction");
});

// wasReviewSkipped — the fail-open sentinel guard the competitive re-render uses.
test("wasReviewSkipped distinguishes a fail-open skip from a real verdict", () => {
  assert.equal(wasReviewSkipped(V({ notes: "review skipped: image fetch 500" })), true);
  assert.equal(wasReviewSkipped(V({ notes: "great composition" })), false);
  assert.equal(wasReviewSkipped(V({ notes: "" })), false);
});

const vPeer = (over: Partial<CompetitorPost> = {}): CompetitorPost => ({
  platform: "instagram", url: "u", text: "real people mid-cleanup, bright morning",
  likes: 40, comments: 5, shares: 0, author: "peer", ...over,
});

// compareVisualToCompetitors (wrapper) — offline skip/error guards (invariant #1).
// askVisionImpl is injected so NOTHING here touches the network or a vision model.
test("compareVisualToCompetitors skips (no re-render) with no same-platform peers", async () => {
  const v = await compareVisualToCompetitors({ imageUrl: "https://img/x.png", intent: "i", platform: "x", peers: [vPeer({ platform: "instagram" })], askVisionImpl: async () => { throw new Error("should not be called"); } });
  assert.deepEqual(v, { competitive: true, suggestions: [], notes: "", comparedTo: 0 });
});

test("compareVisualToCompetitors skips when the render URL is unfetchable", async () => {
  const v = await compareVisualToCompetitors({ imageUrl: "", intent: "i", peers: [vPeer()], askVisionImpl: async () => { throw new Error("should not be called"); } });
  assert.equal(v.comparedTo, 0);
  assert.equal(v.competitive, true);
});

test("compareVisualToCompetitors degrades a vision error to a skipped verdict (never throws)", async () => {
  const v = await compareVisualToCompetitors({ imageUrl: "https://img/x.png", intent: "i", peers: [vPeer()], askVisionImpl: async () => { throw new Error("vision 503"); } });
  assert.equal(v.comparedTo, 0);
  assert.deepEqual(v.suggestions, []);
});

test("compareVisualToCompetitors parses a real verdict on the happy path", async () => {
  const v = await compareVisualToCompetitors({ imageUrl: "https://img/x.png", intent: "i", peers: [vPeer(), vPeer()], askVisionImpl: async () => '{"competitive": false, "suggestions": ["bigger faces"], "notes": "weak"}' });
  assert.equal(v.competitive, false);
  assert.deepEqual(v.suggestions, ["bigger faces"]);
  assert.equal(v.comparedTo, 2);
});

test("buildVisualComparePrompt ranks peers by engagement and states the intent", () => {
  const { system, user } = buildVisualComparePrompt(
    "volunteers filling trash bags at sunrise",
    [vPeer({ text: "low post", likes: 1 }), vPeer({ text: "viral post", likes: 900 })],
    ["#F97316"],
  );
  assert.ok(/art director/i.test(system));
  assert.ok(user.includes("volunteers filling trash bags at sunrise"), "states our image's intent");
  assert.ok(user.includes("#F97316"), "includes the brand palette when known");
  assert.ok(user.indexOf("viral post") < user.indexOf("low post"), "ranked by engagement");
  assert.ok(/ONLY JSON/i.test(user));
});

test("buildVisualComparePrompt names our image vs competitors only when refs are attached", () => {
  const noRefs = buildVisualComparePrompt("our beach", [vPeer()], [], 0);
  assert.ok(!/FIRST attached image is OUR render/i.test(noRefs.user), "no image-to-image framing without refs");
  const withRefs = buildVisualComparePrompt("our beach", [vPeer()], [], 2);
  assert.ok(/FIRST attached image is OUR render/i.test(withRefs.user), "names ours when competitor images are attached");
  assert.ok(withRefs.user.includes("next 2 image"), "states how many competitor images follow");
});

// pickBestRender (PURE) — "best passing render, or the last attempt".
test("pickBestRender returns the passing attempt even when it isn't last", () => {
  const best = pickBestRender([
    A("u1", V({ clean: false, issues: ["x"] })),
    A("u2", V({})),
    A("u3", V({ matchesIntent: false, issues: ["y"] })),
  ]);
  assert.equal(best.imageUrl, "u2");
});

test("pickBestRender prefers an on-brand passer; then fewer issues", () => {
  // onBrand (advisory) is the primary tiebreak: the on-brand passer wins despite more issues.
  const onBrandWins = pickBestRender([A("u1", V({ onBrand: false, issues: [] })), A("u2", V({ onBrand: true, issues: ["a", "b"] }))]);
  assert.equal(onBrandWins.imageUrl, "u2");
  // with onBrand equal, fewer issues wins.
  const fewerIssues = pickBestRender([A("u1", V({ onBrand: true, issues: ["a", "b"] })), A("u2", V({ onBrand: true, issues: ["a"] }))]);
  assert.equal(fewerIssues.imageUrl, "u2");
});

test("pickBestRender breaks an exact tie by earliest (cheapest) attempt", () => {
  // onBrand AND issue-count identical → the stable sort keeps the earliest render.
  const best = pickBestRender([A("u1", V({ onBrand: true, issues: ["x"] })), A("u2", V({ onBrand: true, issues: ["x"] }))]);
  assert.equal(best.imageUrl, "u1");
});

test("pickBestRender returns the LAST (most-corrected) attempt when none pass", () => {
  const best = pickBestRender([A("u1", V({ clean: false })), A("u2", V({ matchesIntent: false }))]);
  assert.equal(best.imageUrl, "u2");
});

test("pickBestRender throws on an empty history", () => {
  assert.throws(() => pickBestRender([]));
});

// fixRender (ASYNC loop, injected stubs) — control flow, fully offline.
test("fixRender ships the original immediately when it already passes (no re-render)", async () => {
  let gens = 0;
  const r = await fixRender({
    imageUrl: "https://img/orig.png",
    prompt: "a tidy beach",
    intent: "a clean beach",
    critique: async () => V({}),
    generate: async () => {
      gens++;
      return "x";
    },
  });
  assert.equal(gens, 0, "a passing original spends no render");
  assert.equal(r.attempts, 1);
  assert.equal(r.passed, true);
  assert.equal(r.imageUrl, "https://img/orig.png");
});

test("fixRender retries with cache-busting prompts and stops the instant a render passes", async () => {
  const seen: string[] = [];
  let n = 0;
  const r = await fixRender({
    imageUrl: "https://img/orig.png",
    prompt: "a tidy beach at sunrise",
    intent: "a clean beach",
    critique: async () => (++n === 1 ? V({ clean: false, issues: ["garbled sign"] }) : V({})),
    generate: async (p) => {
      seen.push(p);
      return `https://img/rev${seen.length}.png`;
    },
  });
  assert.equal(seen.length, 1, "stops as soon as the retry passes");
  assert.equal(r.attempts, 2);
  assert.equal(r.passed, true);
  assert.equal(r.imageUrl, "https://img/rev1.png");
  assert.ok(seen[0].includes("Revision 1") && seen[0].includes("a tidy beach at sunrise"));
  assert.notEqual(seen[0], "a tidy beach at sunrise", "the retry prompt is not the cache-hitting original");
});

test("fixRender honors maxRetries when nothing passes and returns the last attempt", async () => {
  const seen: string[] = [];
  const r = await fixRender({
    imageUrl: "https://img/orig.png",
    prompt: "beach",
    intent: "a clean beach",
    maxRetries: 2,
    critique: async () => V({ matchesIntent: false, issues: ["off topic"] }),
    generate: async (p) => {
      seen.push(p);
      return `https://img/rev${seen.length}.png`;
    },
  });
  assert.equal(seen.length, 2, "1 + maxRetries renders total; cap respected");
  assert.equal(new Set(seen).size, 2, "every render got a distinct (cache-busting) prompt");
  assert.equal(r.attempts, 3);
  assert.equal(r.passed, false);
  assert.equal(r.imageUrl, "https://img/rev2.png", "ships the last, most-corrected render");
});

test("fixRender swallows a render-infra failure mid-loop and ships the best so far", async () => {
  const r = await fixRender({
    imageUrl: "https://img/orig.png",
    prompt: "beach",
    intent: "a clean beach",
    maxRetries: 2,
    critique: async () => V({ clean: false, issues: ["artifact"] }),
    generate: async () => {
      throw new Error("video spend ceiling reached ($20); skipping render");
    },
  });
  assert.equal(r.attempts, 1, "the throwing render is not recorded");
  assert.equal(r.passed, false);
  assert.equal(r.imageUrl, "https://img/orig.png", "falls back to the best render already in hand");
});

test("fixRender uses a precomputed verdict and skips the first critique", async () => {
  let critiqued = false;
  const r = await fixRender({
    imageUrl: "https://img/orig.png",
    prompt: "beach",
    intent: "a clean beach",
    verdict: V({}),
    critique: async () => {
      critiqued = true;
      throw new Error("critique should not be called when a verdict is supplied");
    },
    generate: async () => {
      throw new Error("generate should not be called when the original passes");
    },
  });
  assert.equal(critiqued, false);
  assert.equal(r.attempts, 1);
  assert.equal(r.passed, true);
  assert.equal(r.imageUrl, "https://img/orig.png");
});

test("fixRender threads brandColors through to the retry prompt (on-brand correction)", async () => {
  // End-to-end: prove the palette reaches improveRenderPrompt via the loop, not
  // just when improveRenderPrompt is called directly.
  let seen = "";
  await fixRender({
    imageUrl: "https://img/orig.png",
    prompt: "a tidy beach",
    intent: "a clean beach",
    brandColors: ["#ff0000", "#00ff00"],
    maxRetries: 1,
    critique: async () => V({ onBrand: false, matchesIntent: false, issues: ["off-palette"] }),
    generate: async (p) => {
      seen = p;
      return "https://img/rev1.png";
    },
  });
  assert.ok(seen.includes("#ff0000") && seen.includes("#00ff00"), "brand palette is woven into the re-render prompt");
});
