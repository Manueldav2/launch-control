// Self-test for the self-grading critic. Pure, deterministic, NO API key needed
// (it never calls the model — it exercises gradeSlot, findAiTells, and the
// parseCriticVerdict guard). This is the "the critic catches its own mistakes"
// proof: each case is a known rubric violation that must be flagged.
//
// Run:  npx tsx --test lib/critic.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findAiTells,
  gradeSlot,
  parseCriticVerdict,
  parseCompetitiveVerdict,
  buildFixPrompt,
  buildCompetitiveCopyPrompt,
  compareCopyToCompetitors,
  engagementOf,
  engagementLabel,
} from "./critic";
import type { ContentSlot } from "./types";
import type { CompetitorPost } from "./bright-data";

// A baseline slot that passes every deterministic check; tests mutate one field
// at a time so a failure points at exactly one rubric item.
const ok = (over: Partial<ContentSlot> = {}): ContentSlot => ({
  platform: "x",
  reaction: "rally",
  contentType: "text",
  copy: "Sat 9am: bags and gloves on us. Bring a friend and claim your beach.",
  ...over,
});

// #1 — AI-tells (incl. the em-dash family)
test("flags an em-dash and its lookalikes", () => {
  for (const dash of ["—", "–", "―"]) {
    assert.ok(findAiTells(`We are thrilled ${dash} truly`).length > 0, `dash ${dash}`);
  }
  assert.deepEqual(findAiTells("plain hyphen - is fine"), []);
});

test("#1 gradeSlot fails copy containing an AI-tell", () => {
  const g = gradeSlot(ok({ copy: "Let's delve into why this matters for you today." }));
  assert.equal(g.pass, false);
  assert.ok(g.failures.some((f) => f.startsWith("AI-tells")));
});

// #2 — X channel length
test("#2 gradeSlot fails an X post over 280 chars", () => {
  const g = gradeSlot(ok({ copy: "a".repeat(281) }));
  assert.equal(g.pass, false);
  assert.ok(g.failures.some((f) => f.includes("over 280")));
});

test("#2 the 280 limit is X-only (a long LinkedIn post passes)", () => {
  const g = gradeSlot(ok({ platform: "linkedin", copy: "b".repeat(600) }));
  assert.deepEqual(g.failures, []);
});

// #3 — non-empty
test("#3 gradeSlot fails empty / too-short copy", () => {
  assert.equal(gradeSlot(ok({ copy: "  " })).pass, false);
  assert.equal(gradeSlot(ok({ copy: "go" })).pass, false);
});

// #4 — media slots need a concrete prompt (whitespace does not count)
test("#4 gradeSlot fails a media slot with no real prompt", () => {
  assert.equal(gradeSlot(ok({ contentType: "image" })).pass, false);
  assert.equal(gradeSlot(ok({ contentType: "motion_video", mediaPrompt: "   " })).pass, false);
  assert.equal(
    gradeSlot(ok({ contentType: "image", mediaPrompt: "sunrise over a clean beach, volunteers" })).pass,
    true,
  );
});

test("a clean slot passes with no failures", () => {
  assert.deepEqual(gradeSlot(ok()), { pass: true, failures: [] });
});

// #5/#6 parse guard — the regression this protects against
test("parseCriticVerdict flags only explicit yes verdicts", () => {
  assert.deepEqual(parseCriticVerdict("FABRICATED: yes\nNO_CTA: no"), ["possible fabrication"]);
  assert.deepEqual(parseCriticVerdict("FABRICATED: no\nNO_CTA: yes"), ["CTA missing"]);
  assert.deepEqual(parseCriticVerdict("FABRICATED: no\nNO_CTA: no"), []);
});

test("parseCriticVerdict does NOT false-positive on prose mentioning the labels", () => {
  // The exact bug the rewrite fixes: a substring scan would flag both of these.
  assert.deepEqual(parseCriticVerdict("Neither fabricated nor a missing CTA — looks clean."), []);
  assert.deepEqual(parseCriticVerdict("ok"), []);
});

// ── COMPETITIVE COMPARISON (Bright Data critic) ──────────────────────────────
// All pure/offline — exercises the verdict parser, the rewrite-steer builder, and
// the comparison-prompt builder with NO API key, mirroring the discipline above.

const peer = (over: Partial<CompetitorPost> = {}): CompetitorPost => ({
  platform: "x",
  url: "https://x.com/p/1",
  text: "Saturday 9am. Bags on us. Bring a friend.",
  likes: 10, comments: 2, shares: 1,
  author: "peer",
  ...over,
});

test("engagementOf sums likes + comments + shares (tolerating junk)", () => {
  assert.equal(engagementOf({ likes: 5, comments: 3, shares: 2 }), 10);
  assert.equal(engagementOf({ likes: NaN as any, comments: 4, shares: undefined as any }), 4);
});

test("engagementLabel says 'engagement n/a' when a source exposes no counts (e.g. LinkedIn)", () => {
  assert.equal(engagementLabel({ likes: 12, comments: 1, shares: 0 }), "13 eng");
  assert.equal(engagementLabel({ likes: 0, comments: 0, shares: 0 }), "engagement n/a");
});

test("parseCompetitiveVerdict reads competitive + trims/caps suggestions", () => {
  const v = parseCompetitiveVerdict(
    '{"competitive": false, "suggestions": ["  sharpen the hook ", "add a place", "", 7, "x", "y"], "notes": "weak"}',
    6,
  );
  assert.equal(v.competitive, false);
  assert.deepEqual(v.suggestions, ["sharpen the hook", "add a place", "x", "y"]); // blank/non-string dropped, capped to 4
  assert.equal(v.notes, "weak");
  assert.equal(v.comparedTo, 6);
});

test("parseCompetitiveVerdict tolerates string 'yes'/'true' for competitive, fails closed otherwise", () => {
  assert.equal(parseCompetitiveVerdict('{"competitive":"yes","suggestions":[]}', 3).competitive, true);
  assert.equal(parseCompetitiveVerdict('{"competitive":"true","suggestions":[]}', 3).competitive, true);
  // anything else reads as NOT competitive (at worst one extra improvement pass)
  assert.equal(parseCompetitiveVerdict('{"competitive":"no","suggestions":[]}', 3).competitive, false);
  assert.equal(parseCompetitiveVerdict('{"suggestions":[]}', 3).competitive, false);
  // truthy-but-not-a-yes shapes (1, {}) must NOT read as competitive (fail-closed)
  assert.equal(parseCompetitiveVerdict('{"competitive":1,"suggestions":[]}', 3).competitive, false);
  assert.equal(parseCompetitiveVerdict('{"competitive":{},"suggestions":[]}', 3).competitive, false);
});

test("parseCompetitiveVerdict degrades a no-JSON reply to a safe no-suggestion verdict", () => {
  // No JSON → no suggestions → the route never triggers a rewrite. Must not throw.
  const v = parseCompetitiveVerdict("I can't compare these.", 5);
  assert.equal(v.competitive, false);
  assert.deepEqual(v.suggestions, []);
  assert.equal(v.comparedTo, 5);
});

test("buildFixPrompt folds competitive suggestions into the rewrite steer", () => {
  const slot = ok();
  const plain = buildFixPrompt(slot, ["AI-tells: delve"]);
  assert.ok(!/out-perform/i.test(plain.system), "no competitive steer without suggestions");
  const comp = buildFixPrompt(slot, ["AI-tells: delve"], ["sharper hook naming the beach", "concrete time"]);
  assert.ok(/out-perform/i.test(comp.system), "adds a competitive steer");
  assert.ok(comp.system.includes("sharper hook naming the beach"), "weaves in the concrete suggestion");
  assert.ok(/never copy/i.test(comp.system), "still forbids copying competitors verbatim");
});

test("buildCompetitiveCopyPrompt ranks the corpus by engagement and shows our draft", () => {
  const slot = ok({ copy: "OUR DRAFT HERE", platform: "x" });
  const { user } = buildCompetitiveCopyPrompt(slot, "RSVP now", [
    peer({ text: "low engagement post", likes: 1, comments: 0, shares: 0 }),
    peer({ text: "high engagement post", likes: 500, comments: 20, shares: 10 }),
  ]);
  assert.ok(user.includes("OUR DRAFT HERE"), "includes our copy");
  assert.ok(user.includes("RSVP now"), "includes the day's CTA");
  // the higher-engagement post must appear before the lower one in the corpus
  assert.ok(user.indexOf("high engagement post") < user.indexOf("low engagement post"), "ranked by engagement");
});

// compareCopyToCompetitors (wrapper) — offline skip/error guards (invariant #1).
// The 5th arg injects `ask` so NOTHING here touches the network or an API key.
test("compareCopyToCompetitors skips (no rewrite) when there are no same-platform peers", async () => {
  const noPeers = await compareCopyToCompetitors(ok(), "RSVP", [], undefined, async () => { throw new Error("should not be called"); });
  assert.deepEqual(noPeers, { competitive: true, suggestions: [], notes: "", comparedTo: 0 });
  const wrongPlatform = await compareCopyToCompetitors(ok({ platform: "x" }), "RSVP", [peer({ platform: "instagram" })], undefined, async () => { throw new Error("should not be called"); });
  assert.equal(wrongPlatform.comparedTo, 0);
});

test("compareCopyToCompetitors skips when our copy is empty", async () => {
  const v = await compareCopyToCompetitors(ok({ copy: "   " }), "RSVP", [peer()], undefined, async () => { throw new Error("should not be called"); });
  assert.equal(v.comparedTo, 0);
  assert.equal(v.competitive, true);
});

test("compareCopyToCompetitors degrades an LLM error to a skipped verdict (never throws)", async () => {
  const v = await compareCopyToCompetitors(ok(), "RSVP", [peer()], undefined, async () => { throw new Error("anthropic 529"); });
  assert.deepEqual(v, { competitive: true, suggestions: [], notes: "", comparedTo: 0 });
});

test("compareCopyToCompetitors parses a real verdict on the happy path", async () => {
  const v = await compareCopyToCompetitors(ok(), "RSVP", [peer(), peer()], undefined, async () => '{"competitive": false, "suggestions": ["name the beach"], "notes": "weak hook"}');
  assert.equal(v.competitive, false);
  assert.deepEqual(v.suggestions, ["name the beach"]);
  assert.equal(v.comparedTo, 2);
});
