// Self-test for the VISUAL critic. Pure, deterministic, NO API key needed (it
// never calls the vision model — it exercises parseVisualVerdict + gradeRender).
// The image analog of lib/critic.test.ts: each case is a known visual-verdict
// rule that must hold, so a regression in the pass logic fails the build.
//
// Run:  npx tsx --test lib/visual-critic.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVisualVerdict, gradeRender } from "./visual-critic";

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
