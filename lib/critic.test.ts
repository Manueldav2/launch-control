// Self-test for the self-grading critic. Pure, deterministic, NO API key needed
// (it never calls the model — it exercises gradeSlot, findAiTells, and the
// parseCriticVerdict guard). This is the "the critic catches its own mistakes"
// proof: each case is a known rubric violation that must be flagged.
//
// Run:  npx tsx --test lib/critic.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { findAiTells, gradeSlot, parseCriticVerdict } from "./critic";
import type { ContentSlot } from "./types";

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
