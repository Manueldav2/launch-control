// Offline tests for the Bright Data post extraction. Because extractPosts() is
// pure, we verify the per-platform shape handling — including the nested
// posts[] / activity[] flattening and the per-dataset engagement field names —
// with NO API key and NO network. Fixtures mirror the real shapes confirmed
// against live snapshots.
// Run: npx tsx --test lib/bright-data.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPosts, classifyPlatform, groupByPlatform, capPerAccount, type CompetitorPost } from "./bright-data";

test("X: a top-level post record keeps text and maps engagement field names", () => {
  const posts = extractPosts("x", [
    { url: "https://x.com/o/status/1", description: "Join the cleanup Saturday, RSVP now", likes: 120, replies: 7, reposts: 9, user_posted: "org" },
  ]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].text, "Join the cleanup Saturday, RSVP now");
  assert.equal(posts[0].likes, 120);
  assert.equal(posts[0].comments, 7); // replies -> comments
  assert.equal(posts[0].shares, 9);   // reposts -> shares
  assert.equal(posts[0].author, "org");
});

test("Instagram: a profile record's nested posts[] is flattened", () => {
  const posts = extractPosts("instagram", [
    { account: "ourorg", posts: [
      { url: "u1", caption: "first", likes: 50, comments: 2 },
      { url: "u2", caption: "second", likes: 90, comments: 5 },
    ] },
  ]);
  assert.equal(posts.length, 2);
  assert.equal(posts[0].author, "ourorg");
  assert.equal(posts[1].text, "second");
  assert.equal(posts[1].likes, 90);
  assert.equal(posts[1].shares, 0); // IG dataset exposes no shares
});

test("LinkedIn: nested activity[] uses title as text; absent engagement -> 0", () => {
  const posts = extractPosts("linkedin", [
    { name: "Jane Doe", activity: [{ link: "l1", title: "We launch Monday, join us", interaction: "Post" }] },
  ]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].text, "We launch Monday, join us");
  assert.equal(posts[0].likes, 0);
  assert.equal(posts[0].author, "Jane Doe");
});

test("LinkedIn: per-post engagement IS read when the activity record exposes it", () => {
  const posts = extractPosts("linkedin", [
    { name: "Org", activity: [{ link: "l1", title: "Big day Saturday", num_likes: 80, num_comments: 6, reposts: 4 }] },
  ]);
  assert.equal(posts[0].likes, 80);
  assert.equal(posts[0].comments, 6);
  assert.equal(posts[0].shares, 4); // recovers real ranking signal where present
});

test("posts with empty/whitespace text are dropped", () => {
  const posts = extractPosts("instagram", [
    { account: "o", posts: [{ url: "u", caption: "   ", likes: 1 }, { url: "u2", caption: "real", likes: 2 }] },
  ]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].text, "real");
});

test("malformed / missing nested arrays never throw", () => {
  assert.deepEqual(extractPosts("instagram", [{}]), []);
  assert.deepEqual(extractPosts("linkedin", [{ activity: null }]), []);
  assert.deepEqual(extractPosts("x", [{}]), []); // no description -> dropped
  assert.deepEqual(extractPosts("instagram", []), []);
});

// imageUrl — the optional visual the IMAGE critic compares against. Tolerant:
// many field names + array shapes, anything non-http is ignored (never bogus).
test("Instagram: a post's lead image is captured from display_url", () => {
  const posts = extractPosts("instagram", [
    { account: "o", posts: [{ url: "u", caption: "c", likes: 3, display_url: "https://cdn/i.jpg" }] },
  ]);
  assert.equal(posts[0].imageUrl, "https://cdn/i.jpg");
});

test("X: lead image is captured from a photos[] array of objects", () => {
  const posts = extractPosts("x", [
    { url: "x1", description: "join us", likes: 5, photos: [{ url: "https://cdn/x.jpg" }] },
  ]);
  assert.equal(posts[0].imageUrl, "https://cdn/x.jpg");
});

test("imageUrl is undefined when absent and never accepts a non-http value", () => {
  const none = extractPosts("instagram", [{ account: "o", posts: [{ url: "u", caption: "c", likes: 1 }] }]);
  assert.equal(none[0].imageUrl, undefined);
  const junk = extractPosts("x", [{ url: "x", description: "hi", likes: 1, image_url: "not-a-url" }]);
  assert.equal(junk[0].imageUrl, undefined);
});

// ── URL ROUTING — classify a profile/post URL to its scrape platform ─────────
test("classifyPlatform maps the supported hosts (incl. www / regional / handle URLs)", () => {
  assert.equal(classifyPlatform("https://x.com/surfrider"), "x");
  assert.equal(classifyPlatform("https://twitter.com/surfrider/status/123"), "x");
  assert.equal(classifyPlatform("https://www.instagram.com/oceanconservancy"), "instagram");
  assert.equal(classifyPlatform("https://www.linkedin.com/company/ocean-conservancy"), "linkedin");
  assert.equal(classifyPlatform("https://fr.linkedin.com/company/x"), "linkedin");
  assert.equal(classifyPlatform("instagram.com/heal_the_bay"), "instagram"); // scheme optional
});

test("classifyPlatform returns null for non-social / malformed URLs", () => {
  assert.equal(classifyPlatform("https://surfrider.org"), null);
  assert.equal(classifyPlatform("https://tiktok.com/@x"), null); // not a wired content platform
  assert.equal(classifyPlatform("not a url at all"), null);
  assert.equal(classifyPlatform(""), null);
});

test("classifyPlatform tolerates surrounding whitespace (trims before the scheme test)", () => {
  // A leading space/newline must NOT defeat the ^https?:// anchor and get dropped.
  assert.equal(classifyPlatform("  https://x.com/handle"), "x");
  assert.equal(classifyPlatform("\nhttps://instagram.com/foo\t"), "instagram");
  assert.equal(classifyPlatform("  instagram.com/bar  "), "instagram");
});

// ── capPerAccount — stop one viral account from dominating the benchmark ─────
const cp = (author: string, likes: number, url = `https://x.com/${author}/${likes}`): CompetitorPost => ({
  platform: "x", url, text: `post ${likes}`, likes, comments: 0, shares: 0, author,
});

test("capPerAccount keeps at most N posts per account, preserving order", () => {
  const posts = [cp("viral", 900), cp("viral", 800), cp("viral", 700), cp("small", 50), cp("mid", 200)];
  const capped = capPerAccount(posts, 2);
  assert.deepEqual(capped.map((p) => `${p.author}:${p.likes}`), ["viral:900", "viral:800", "small:50", "mid:200"]);
  // so a later .slice(0,N) now surfaces multiple accounts instead of all-viral
});

test("capPerAccount falls back to the URL profile when author is blank, and is a no-op for perAccount<=0", () => {
  const a = { platform: "instagram" as const, url: "https://instagram.com/acme/1", text: "x", likes: 5, comments: 0, shares: 0, author: "" };
  const b = { platform: "instagram" as const, url: "https://instagram.com/acme/2", text: "y", likes: 4, comments: 0, shares: 0, author: "" };
  assert.equal(capPerAccount([a, b], 1).length, 1); // same profile path -> grouped despite blank author
  assert.equal(capPerAccount([a, b], 0).length, 2); // 0 disables the cap
});

test("groupByPlatform routes classified URLs to their platform; unclassified go to all", () => {
  const g = groupByPlatform([
    "https://x.com/a",
    "https://instagram.com/b",
    "https://linkedin.com/company/c",
    "https://example.com/d", // unclassified
    "   ", // skipped
  ]);
  assert.deepEqual(g.x, ["https://x.com/a", "https://example.com/d"]);
  assert.deepEqual(g.instagram, ["https://instagram.com/b", "https://example.com/d"]);
  assert.deepEqual(g.linkedin, ["https://linkedin.com/company/c", "https://example.com/d"]);
});
