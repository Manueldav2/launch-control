// Launch Control — self-grading acceptance harness.
//
// One command grades the WHOLE system against docs/rubric.md, hitting the live
// (or local) deployment. No human in the loop: every check is a hard binary and
// the process exits 0 only when the project is green. Rerun on ANY problem by
// passing --goal/--cta/--website/--location, which proves the engine is not
// cleanup-specific.
//
//   node scripts/verify.mjs                          # defaults: live URL, a fresh problem
//   node scripts/verify.mjs --url http://localhost:3000
//   node scripts/verify.mjs --goal "..." --cta "..." --website "https://..." --location "Austin, TX"
//   node scripts/verify.mjs --no-media               # skip the (cheap) render+persist check
//
// Exit 0 = ALL GREEN (acceptance passed). Exit 1 = a check failed.

const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith("--")) return args[i + 1];
  return def;
}
const has = (name) => args.includes(`--${name}`);

const URL_BASE = flag("url", process.env.PUBLIC_BASE_URL || "https://launch-control-phi.vercel.app").replace(/\/$/, "");
// Default to a DIFFERENT problem than the demo (a Habitat home build) so a green
// run is evidence the pipeline generalizes, not that it memorized the beach.
const GOAL = flag("goal", "Get 60 volunteers to our Saturday home build");
const CTA = flag("cta", "Come build with us, 8am on site");
const WEBSITE = flag("website", "https://www.habitat.org");
const LOCATION = flag("location", "Atlanta, GA");
const DO_MEDIA = !has("no-media");

let pass = 0, fail = 0;
const fails = [];
function check(name, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (ok) pass++; else { fail++; fails.push(name); }
}
function section(t) { console.log(`\n${t}`); }
async function fetchJSON(url, opts = {}, ms = 200000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    let body = {};
    try { body = await r.json(); } catch { /* non-json */ }
    return { status: r.status, ok: r.ok, body };
  } finally { clearTimeout(t); }
}
const cityToken = (LOCATION.split(",")[0] || "").trim().toLowerCase();

async function main() {
  console.log(`Launch Control acceptance — ${URL_BASE}`);
  console.log(`Problem under test: "${GOAL}" @ ${LOCATION} (${WEBSITE})`);

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

  // ── 3. The week plans, writes, and SELF-GRADES green (Opus 4.8 + Impact) ────
  section("3. Generate + self-grade a 7-day week (Opus 4.8 strategist + critic)");
  const wk = await fetchJSON(URL_BASE + "/api/generate-week", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goal: GOAL, cta: CTA, website: WEBSITE, location: LOCATION }),
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

  // ── 4. Weather-aware event mode (creative Opus use) ─────────────────────────
  section("4. Event mode weather watch");
  const w = plan?.weather;
  check("forecast attached for the in-person event", !!w && typeof w.precipProb === "number" && !!w.weekday, w ? `${w.weekday}: ${w.condition} ${w.precipProb}%` : "no weather");
  check("recommendation is one of reschedule|rain_plan|proceed", !!w && ["reschedule", "rain_plan", "proceed"].includes(w.recommendation), w?.recommendation);

  // ── 5. Media renders AND persists (not just text) ───────────────────────────
  if (DO_MEDIA) {
    section("5. Media is real (render + permanent store)");
    const m = await fetchJSON(URL_BASE + "/api/generate-media", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: "image", prompt: "a bright on-brand launch poster, clean modern type", location: LOCATION }),
    });
    check("POST /api/generate-media renders a url", m.status === 200 && !!m.body?.url, m.body?.error || (m.body?.url || "").slice(0, 50));
    check("media persisted to object storage", m.body?.persisted === true && String(m.body?.url || "").includes("supabase"), `persisted=${m.body?.persisted}`);
  } else {
    section("5. Media check skipped (--no-media)");
  }

  // ── 6. Distribution routing is correct (no real posts) ──────────────────────
  section("6. Channel routing (safe — posts nothing)");
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

  // ── Scorecard ───────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESULT: ${fail === 0 ? "ALL GREEN" : `${fail} FAILURE(S)`}  (${pass}/${pass + fail} checks)`);
  if (fail) console.log("Failed: " + fails.join("; "));
  console.log("=".repeat(60));
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error("verify crashed:", e); process.exit(1); });
