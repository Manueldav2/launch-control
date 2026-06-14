// Offline tests for the competitor DISCOVERY parsing + resolution guards. Like
// bright-data.test.ts, these are pure/deterministic with NO API key and NO
// network: extractCompetitorUrls is a pure parser, and resolveCompetitorPosts'
// Bright-Data-off branch returns empties without touching the model or the
// scraper. Mirrors the testability discipline in critic.ts / visual-critic.ts.
// Run: npx tsx --test lib/research.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCompetitorUrls, resolveCompetitorPosts } from "./research";

test("extractCompetitorUrls flattens the discovery JSON into platform profile URLs", () => {
  const urls = extractCompetitorUrls(JSON.stringify({
    competitors: [
      { name: "Ocean Conservancy", x: "https://x.com/OurOcean", instagram: "https://instagram.com/oceanconservancy", linkedin: "https://linkedin.com/company/ocean-conservancy" },
      { name: "Heal the Bay", instagram: "https://instagram.com/healthebay" },
    ],
  }));
  assert.deepEqual(urls, [
    "https://x.com/OurOcean",
    "https://instagram.com/oceanconservancy",
    "https://linkedin.com/company/ocean-conservancy",
    "https://instagram.com/healthebay",
  ]);
});

test("extractCompetitorUrls drops non-platform / junk values and de-dupes", () => {
  const urls = extractCompetitorUrls(JSON.stringify({
    competitors: [
      { name: "A", x: "https://x.com/a", instagram: "not-a-url", linkedin: "https://example.com/a" },
      { name: "A dup", x: "https://x.com/a" }, // duplicate dropped
      { name: "B", x: 123 as any }, // non-string dropped
    ],
  }));
  assert.deepEqual(urls, ["https://x.com/a"]); // example.com + non-url + dup all gone
});

test("extractCompetitorUrls keeps URLs that have surrounding whitespace (trims, never drops)", () => {
  const urls = extractCompetitorUrls(JSON.stringify({
    competitors: [{ name: "A", x: "  https://x.com/a", instagram: "\nhttps://instagram.com/b\t" }],
  }));
  assert.deepEqual(urls, ["https://x.com/a", "https://instagram.com/b"]);
});

test("extractCompetitorUrls returns [] on a reply with no JSON (never throws)", () => {
  assert.deepEqual(extractCompetitorUrls("Sorry, I can't help with that."), []);
  assert.deepEqual(extractCompetitorUrls(JSON.stringify({ competitors: "nope" })), []);
});

test("extractCompetitorUrls caps the number of URLs", () => {
  const many = { competitors: Array.from({ length: 10 }, (_, i) => ({ name: `O${i}`, x: `https://x.com/o${i}` })) };
  assert.equal(extractCompetitorUrls(JSON.stringify(many), 5).length, 5);
});

// resolveCompetitorPosts — with Bright Data OFF (no key in the test env) it must
// be a pure no-op: no discovery, no scrape, empties returned. This pins the
// opt-in invariant (the engine behaves exactly as before without a key).
test("resolveCompetitorPosts is a no-op when Bright Data is disabled", async () => {
  delete process.env.BRIGHT_DATA_API_KEY;
  const out = await resolveCompetitorPosts({ goal: "g", cta: "c", website: "https://x.org", autoDiscover: true });
  assert.deepEqual(out, { competitors: [], posts: [] });
});
