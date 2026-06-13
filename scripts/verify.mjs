#!/usr/bin/env node
// scripts/verify.mjs — the model-verifiable "DONE" gate. One command, one exit
// code, NO human judgment. It answers the Orchestration question literally:
//
//   "Is 'done' verifiable by the model without a human — a test suite, a
//    responding URL, a rubric file it can grade against?"
//
// Two layers, both machine-graded:
//
//   Gate 1 — RUBRIC TESTS (always, offline, no key): every lib/*.test.ts must
//     pass. They assert docs/rubric.md (copy checks #1-6 + visual V0-V3) and the
//     drift-guard that keeps the doc and the code in lockstep. This is the gate
//     CI runs on every push — bare `node scripts/verify.mjs`, zero setup.
//
//   Live acceptance (opt-in: --url <base>, or --live for the deployed URL):
//     grades the WHOLE running system against docs/rubric.md as hard binaries —
//     deployment up, 4 channels connectable, the sign-in gate, a 7-day week that
//     self-grades green (brand researched, copy localized, zero AI-tells),
//     weather attached, media renders + persists, routing correct. Defaults to a
//     FRESH problem (a Habitat home build in Atlanta) so a green run is evidence
//     the engine generalizes; override with --goal/--cta/--website/--location and
//     any team can rerun it tomorrow on a new problem.
//
//   node scripts/verify.mjs                                  # gate 1 only (CI, offline, no key)
//   node scripts/verify.mjs --url http://localhost:3000      # + acceptance vs a local dev server
//   node scripts/verify.mjs --live                           # + acceptance vs the deployed URL
//   node scripts/verify.mjs --live --goal "..." --cta "..." --website "https://..." --location "Austin, TX"
//   node scripts/verify.mjs --live --no-media                # skip the (cheap) render+persist check
//
// Exits 0 only when EVERY check that ran passed. Gate 1 always runs, so the bare
// command is a zero-setup proof that the rubric holds; the live acceptance is
// opt-in (it needs a running app, a key, and Supabase for the sign-in bootstrap).

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── args ─────────────────────────────────────────────────────────────────────
const FLAGS = new Set(["run", "live", "shallow", "no-media", "help"]);
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (!a.startsWith("--")) continue;
    a = a.slice(2);
    const eq = a.indexOf("=");
    if (eq >= 0) { out[a.slice(0, eq)] = a.slice(eq + 1); continue; }
    if (FLAGS.has(a)) { out[a] = true; continue; }
    out[a] = argv[++i];
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("node scripts/verify.mjs [--url <base> | --live] [--goal .. --cta .. --website .. --location ..] [--no-media] [--shallow]");
  process.exit(0);
}

// ── unified result recording (one verdict, one exit code) ────────────────────
const results = []; // { name, ok }
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`); return ok; };
const section = (t) => console.log(`\n${t}`);

// ── Gate 1: rubric test suites (offline, no API key) — ALWAYS RUNS ───────────
section("Gate 1. Rubric tests (offline, no API key)");
const testFiles = readdirSync(join(REPO, "lib"))
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => join("lib", f))
  .sort();
if (testFiles.length === 0) {
  check("rubric tests", false, "no lib/*.test.ts found");
} else {
  const r = spawnSync("npx", ["tsx", "--test", ...testFiles], { cwd: REPO, encoding: "utf8" });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const pass = (out.match(/^# pass (\d+)/m) || out.match(/ℹ pass (\d+)/) || [])[1];
  const failN = (out.match(/^# fail (\d+)/m) || out.match(/ℹ fail (\d+)/) || [])[1];
  const ok = r.status === 0;
  if (!ok) console.log(out.split("\n").filter((l) => /fail|Error|✖|not ok/i.test(l)).slice(0, 12).join("\n"));
  check("rubric tests pass", ok, `${testFiles.length} file(s): ${pass ?? "?"} pass / ${failN ?? "?"} fail  [${testFiles.join(", ")}]`);
}

// ── Live acceptance (opt-in) ─────────────────────────────────────────────────
const wantLive = !!(args.url || args.live || args.run);
const URL_BASE = (args.url ? String(args.url) : (process.env.PUBLIC_BASE_URL || "https://launch-control-phi.vercel.app")).replace(/\/+$/, "");

if (!wantLive) {
  console.log("\n· live acceptance — skipped (pass --url <base> or --live to grade the running system)");
} else {
  await liveAcceptance();
}

// ── Verdict ──────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
const ran = results.length;
console.log(`\n${"=".repeat(60)}`);
if (failed.length === 0) {
  console.log(`✅ DONE — ${ran}/${ran} check(s) green. Verified by the model, no human needed.`);
  console.log("=".repeat(60));
  process.exit(0);
}
console.log(`❌ NOT DONE — ${failed.length}/${ran} check(s) failed: ${failed.map((r) => r.name).join(", ")}`);
console.log("=".repeat(60));
process.exit(1);

// ── live acceptance: grade the whole running system against docs/rubric.md ───
// (declaration is hoisted, so it can be invoked above before this definition)
async function liveAcceptance() {
  // Default to a DIFFERENT problem than the demo (a Habitat home build) so a
  // green run is evidence the pipeline generalizes, not that it memorized the beach.
  const GOAL = args.goal || "Get 60 volunteers to our Saturday home build";
  const CTA = args.cta || "Come build with us, 8am on site";
  const WEBSITE = args.website || "https://www.habitat.org";
  const LOCATION = args.location || "Atlanta, GA";
  const DO_MEDIA = !args["no-media"];
  const deepReview = !args.shallow;
  const cityToken = (LOCATION.split(",")[0] || "").trim().toLowerCase();

  console.log(`\nLaunch Control acceptance — ${URL_BASE}`);
  console.log(`Problem under test: "${GOAL}" @ ${LOCATION} (${WEBSITE})`);

  async function fetchJSON(url, opts = {}, ms = 200000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { ...opts, signal: ctrl.signal });
      let body = {};
      try { body = await r.json(); } catch { /* non-json */ }
      return { status: r.status, ok: r.ok, body };
    } catch (e) {
      return { status: 0, ok: false, body: { error: String(e?.message || e) } };
    } finally { clearTimeout(t); }
  }
  function envLocal(k) {
    try {
      for (const l of readFileSync(join(REPO, ".env.local"), "utf8").split("\n")) {
        const i = l.indexOf("="); if (i > 0 && l.slice(0, i).trim() === k) return l.slice(i + 1).trim();
      }
    } catch { /* no .env.local */ }
    return process.env[k] || "";
  }
  // Generation is gated on sign-in, so the harness creates a throwaway account and
  // returns its access token. Needs the (public) Supabase URL + anon key.
  async function bootstrapToken() {
    const SB = envLocal("NEXT_PUBLIC_SUPABASE_URL") || envLocal("SUPABASE_URL");
    const ANON = envLocal("NEXT_PUBLIC_SUPABASE_ANON_KEY") || envLocal("SUPABASE_ANON_KEY");
    if (!SB || !ANON) return "";
    const email = `verify.${Date.now()}@gmail.com`, password = "verifyharness123";
    await fetchJSON(URL_BASE + "/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }, 30000);
    const tok = await fetchJSON(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "Content-Type": "application/json", apikey: ANON }, body: JSON.stringify({ email, password }) }, 30000);
    return tok.body?.access_token || "";
  }

  // ── 1. The deployment responds (Demo) ──────────────────────────────────────
  section("1. Deployment is live");
  const home = await fetchJSON(URL_BASE + "/", {}, 30000);
  check("GET / returns 200", home.status === 200, `status ${home.status}`);

  // ── 2. Channels are wired across all four platforms (Distribution) ──────────
  section("2. Distribution surface (X / LinkedIn / Instagram / TikTok)");
  const conn = await fetchJSON(URL_BASE + "/api/connect", {}, 30000);
  const connectKeys = Object.keys(conn.body?.connect || {});
  check("connect offers all 4 channels", ["x", "linkedin", "instagram", "tiktok"].every((c) => connectKeys.includes(c)), connectKeys.join(","));
  check("at least one account connected", (conn.body?.accounts || []).length > 0, `${(conn.body?.accounts || []).length} connected`);

  // ── 3. Sign-in gate (production auth) ───────────────────────────────────────
  section("3. Sign-in gate + free account");
  const blocked = await fetchJSON(URL_BASE + "/api/generate-week", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: GOAL, cta: CTA, website: WEBSITE }) }, 30000);
  check("generation is blocked without sign-in (401)", blocked.status === 401, `status ${blocked.status}`);
  const TOKEN = await bootstrapToken();
  check("create a free account + sign in", !!TOKEN, TOKEN ? "got token" : "no token (set NEXT_PUBLIC_SUPABASE_*)");
  const AUTH = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};

  // ── 4. The week plans, writes, and SELF-GRADES green (Opus 4.8 + Impact) ────
  section("4. Generate + self-grade a 7-day week (Opus 4.8 strategist + critic)");
  const wk = await fetchJSON(URL_BASE + "/api/generate-week", {
    method: "POST", headers: { "Content-Type": "application/json", ...AUTH },
    body: JSON.stringify({ goal: GOAL, cta: CTA, website: WEBSITE, location: LOCATION, deepReview }),
  });
  const plan = wk.body?.plan;
  const sc = wk.body?.scorecard;
  check("POST /api/generate-week returns 200", wk.status === 200, wk.body?.error || "");
  check("plan has 7 days", (plan?.days?.length || 0) === 7, `${plan?.days?.length} days`);
  const totalSlots = (plan?.days || []).reduce((n, d) => n + (d.slots?.length || 0), 0);
  check("plan has >= 12 content slots", totalSlots >= 12, `${totalSlots} slots`);
  check("self-grade is GREEN (passing === total)", !!sc && sc.passing === sc.total && sc.total > 0, sc ? `${sc.passing}/${sc.total} (fixed ${sc.fixed})` : "no scorecard");
  check("brand researched from the real site", !!plan?.brand?.name && plan.brand.name !== "the organization" && (plan.brand.colors?.length || 0) > 0, `${plan?.brand?.name} / ${(plan?.brand?.colors || []).join(" ")}`);
  // localization: the week should speak to the actual locale for an event-mode launch
  const allCopy = (plan?.days || []).flatMap((d) => d.slots || []).map((s) => s.copy || "").join(" ").toLowerCase();
  check("copy is localized to the event city", cityToken.length > 2 && allCopy.includes(cityToken), `looking for "${cityToken}"`);
  // no AI-tells anywhere in the shipped copy (the rubric's headline rule)
  const TELLS = ["—", "delve", "game-changer", "unlock", "supercharge", "seamless", "leverage", "thrilled to announce", "dive into"];
  const tell = TELLS.find((t) => allCopy.includes(t));
  check("no AI-tells in any copy", !tell, tell ? `found "${tell}"` : "clean");

  // ── 5. Weather-aware event mode (creative Opus use) ─────────────────────────
  section("5. Event mode weather watch");
  const w = plan?.weather;
  check("forecast attached for the in-person event", !!w && typeof w.precipProb === "number" && !!w.weekday, w ? `${w.weekday}: ${w.condition} ${w.precipProb}%` : "no weather");
  check("recommendation is one of reschedule|rain_plan|proceed", !!w && ["reschedule", "rain_plan", "proceed"].includes(w.recommendation), w?.recommendation);

  // ── 6. Media renders AND persists (not just text), within the free quota ────
  if (DO_MEDIA) {
    section("6. Media is real (render + permanent store, free quota)");
    const m = await fetchJSON(URL_BASE + "/api/generate-media", {
      method: "POST", headers: { "Content-Type": "application/json", ...AUTH },
      body: JSON.stringify({ contentType: "image", prompt: "a bright on-brand launch poster, clean modern type", location: LOCATION }),
    });
    check("POST /api/generate-media renders a url", m.status === 200 && !!m.body?.url, m.body?.error || (m.body?.url || "").slice(0, 50));
    check("media persisted to object storage", m.body?.persisted === true && String(m.body?.url || "").includes("supabase"), `persisted=${m.body?.persisted}`);
  } else {
    section("6. Media check skipped (--no-media)");
  }

  // ── 7. Distribution routing is correct (no real posts) ──────────────────────
  section("7. Channel routing (safe — posts nothing)");
  // A UGC slot with no rendered media must route to IG+TikTok and be SKIPPED
  // (those channels require media), proving the routing + connect resolution
  // without publishing anything.
  const pub = await fetchJSON(URL_BASE + "/api/publish", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "schedule", plan: { days: [{ day: 1, weekday: "Monday", slots: [{ platform: "instagram", contentType: "ugc_video", copy: "routing probe (no media -> must skip)" }] }] } }),
  }, 60000);
  const skippedCh = (pub.body?.skipped || []).map((s) => s.channel);
  check("routes ugc_video to Instagram + TikTok", skippedCh.includes("instagram") && skippedCh.includes("tiktok"), skippedCh.join(","));
  check("skips media-only channels with no media (0 posts)", pub.body?.published === 0, `published ${pub.body?.published}`);
}
