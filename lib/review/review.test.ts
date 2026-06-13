// Self-test for the image-reviewer's pure logic — NO API key, NO network.
// Exercises the verdict mapping (the approved/rejected/regenerated decision +
// the bounded regenerate loop) and the image-header decoder the heuristic
// backend leans on.
//
// Run:  npx tsx --test lib/review/review.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideVerdict, buildReview, imageMeta, type CriticReport } from "./critic";
import { configFromEnv } from "./reviewer";
import { STATUS } from "./contract";

const report = (over: Partial<CriticReport> = {}): CriticReport => ({
  method: "vision",
  model: "claude-opus-4-8",
  pass: true,
  matchesIntent: true,
  onBrand: true,
  clean: true,
  issues: [],
  notes: "",
  score: 1,
  fatal: false,
  inspectedUrl: "https://x/y.jpg",
  ...over,
});

// ── verdict mapping ──────────────────────────────────────────────────────────
test("a passing image is approved regardless of version", () => {
  assert.equal(decideVerdict(report({ pass: true }), 1, 3), STATUS.APPROVED);
  assert.equal(decideVerdict(report({ pass: true }), 9, 3), STATUS.APPROVED);
});

test("a fixable fail under the version cap asks for regeneration", () => {
  const r = report({ pass: false, clean: false, issues: ["garbled text"] });
  assert.equal(decideVerdict(r, 1, 3), STATUS.REGENERATED);
  assert.equal(decideVerdict(r, 2, 3), STATUS.REGENERATED);
});

test("the regenerate loop is bounded — at the cap a fail is rejected", () => {
  const r = report({ pass: false, clean: false });
  assert.equal(decideVerdict(r, 3, 3), STATUS.REJECTED);
  assert.equal(decideVerdict(r, 4, 3), STATUS.REJECTED);
});

test("a fatal report (not a usable image) is rejected immediately", () => {
  const r = report({ pass: false, fatal: true });
  assert.equal(decideVerdict(r, 1, 3), STATUS.REJECTED);
});

test("buildReview carries the verdict + provenance into the jsonb record", () => {
  const rec = buildReview(report({ pass: false, issues: ["x"] }), STATUS.REGENERATED, "critic-7");
  assert.equal(rec.verdict, "regenerated");
  assert.equal(rec.reviewer, "critic-7");
  assert.equal(rec.method, "vision");
  assert.deepEqual(rec.issues, ["x"]);
  assert.equal(typeof rec.reviewedAt, "string");
});

// ── image-header decoder ─────────────────────────────────────────────────────
function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // sig
  b.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8); // len + "IHDR"
  b[16] = (w >>> 24) & 255; b[17] = (w >>> 16) & 255; b[18] = (w >>> 8) & 255; b[19] = w & 255;
  b[20] = (h >>> 24) & 255; b[21] = (h >>> 16) & 255; b[22] = (h >>> 8) & 255; b[23] = h & 255;
  return b;
}
function jpeg(w: number, h: number): Uint8Array {
  // SOF0 at offset 2: FF C0 <len> <prec> <H hi><H lo> <W hi><W lo>
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
}
function gif(w: number, h: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // GIF89a
  b[6] = w & 255; b[7] = (w >> 8) & 255; b[8] = h & 255; b[9] = (h >> 8) & 255;
  return b;
}

test("decodes PNG / JPEG / GIF dimensions from the header", () => {
  assert.deepEqual(imageMeta(png(1024, 768)), { format: "png", w: 1024, h: 768 });
  assert.deepEqual(imageMeta(jpeg(512, 512)), { format: "jpeg", w: 512, h: 512 });
  assert.deepEqual(imageMeta(gif(300, 200)), { format: "gif", w: 300, h: 200 });
});

test("returns null for non-image / truncated bytes", () => {
  assert.equal(imageMeta(new Uint8Array([1, 2, 3])), null); // too short
  assert.equal(imageMeta(new TextEncoder().encode("<html>not an image at all!!")), null);
});

test("a truncated WebP header does not read out of bounds", () => {
  // "RIFF"????"WEBPVP8 " but cut at 28 bytes — clears the >=24 top guard and
  // reaches the WebP branch, where unguarded code would read b[28]/b[29] (OOB).
  // Must not throw; recognised-but-truncated → 0 dims (heuristic flags it).
  const b = new Uint8Array(28);
  b.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  b.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  b.set([0x56, 0x50, 0x38, 0x20], 12); // "VP8 "
  const m = imageMeta(b);
  assert.equal(m?.format, "webp");
  assert.equal(m?.w, 0);
});

// ── env hardening ────────────────────────────────────────────────────────────
test("configFromEnv falls back to safe defaults on bad numeric env", () => {
  const save = { ...process.env };
  try {
    process.env.REVIEW_POLL_MS = "abc"; // NaN would hot-spin the loop
    process.env.REVIEW_CLAIM_TTL_MS = "-5"; // negative would break Date math
    process.env.REVIEW_MAX_VERSIONS = ""; // empty would never bound regen
    const cfg = configFromEnv();
    assert.equal(cfg.pollMs, 4000);
    assert.equal(cfg.claimTtlMs, 300000);
    assert.equal(cfg.maxVersions, 3);
  } finally {
    process.env = save;
  }
});
