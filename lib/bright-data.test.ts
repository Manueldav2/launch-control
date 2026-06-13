// Offline tests for the Bright Data post extraction. Because extractPosts() is
// pure, we verify the per-platform shape handling — including the nested
// posts[] / activity[] flattening and the per-dataset engagement field names —
// with NO API key and NO network. Fixtures mirror the real shapes confirmed
// against live snapshots.
// Run: npx tsx --test lib/bright-data.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPosts } from "./bright-data";

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
