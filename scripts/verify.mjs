#!/usr/bin/env node
// scripts/verify.mjs — the model-verifiable "DONE" gate. One command, one exit
// code, NO human judgment. It answers the Orchestration question literally:
//
//   "Is 'done' verifiable by the model without a human — a test suite, a
//    responding URL, a rubric file it can grade against?"
//
// Three gates, each maps to one phrase of that question:
//   1. RUBRIC TESTS  (always, offline, no key) — every lib/*.test.ts must pass.
//      These assert the rubric in docs/rubric.md (copy checks #1-6 + visual V0-V3).
//   2. RESPONDING URL  (--url <base>) — GET <base>/ must return HTTP 200.
//   3. SCORECARD GREEN (--run --goal --cta --website) — a real engine run must
//      come back with scorecard.passing === scorecard.total.
//
//   node scripts/verify.mjs
//   node scripts/verify.mjs --url http://localhost:3000
//   node scripts/verify.mjs --url http://localhost:3000 --run \
//        --goal "..." --cta "..." --website "https://..."
//
// Exits 0 only when EVERY gate that ran passed. Gates 2-3 are opt-in (they need
// a running app / a key); gate 1 always runs, so `node scripts/verify.mjs` is a
// zero-setup proof that the rubric holds.

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const FLAGS = new Set(["run", "shallow", "help"]);
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
  console.log("node scripts/verify.mjs [--url <base>] [--run --goal .. --cta .. --website ..] [--shallow]");
  process.exit(0);
}

const results = []; // { name, ok, detail }
const record = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? "✓" : "✗"} ${name} — ${detail}`); };

// ── Gate 1: rubric test suites (offline, no API key) ─────────────────────────
const testFiles = readdirSync(join(REPO, "lib"))
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => join("lib", f))
  .sort();

if (testFiles.length === 0) {
  record("rubric tests", false, "no lib/*.test.ts found");
} else {
  const r = spawnSync("npx", ["tsx", "--test", ...testFiles], { cwd: REPO, encoding: "utf8" });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const pass = (out.match(/^# pass (\d+)/m) || out.match(/ℹ pass (\d+)/) || [])[1];
  const failN = (out.match(/^# fail (\d+)/m) || out.match(/ℹ fail (\d+)/) || [])[1];
  const ok = r.status === 0;
  if (!ok) console.log(out.split("\n").filter((l) => /fail|Error|✖|not ok/i.test(l)).slice(0, 12).join("\n"));
  record("rubric tests", ok, `${testFiles.length} file(s): ${pass ?? "?"} pass / ${failN ?? "?"} fail  [${testFiles.join(", ")}]`);
}

// ── Gate 2: the deployed/dev URL responds 200 ────────────────────────────────
const base = args.url ? String(args.url).replace(/\/+$/, "") : null;
if (base) {
  try {
    const res = await fetch(`${base}/`, { method: "GET" });
    record("responding URL", res.ok, `GET ${base}/ → HTTP ${res.status}`);
  } catch (e) {
    record("responding URL", false, `GET ${base}/ failed: ${e?.message || e}`);
  }
} else {
  console.log("· responding URL — skipped (pass --url <base> to check)");
}

// ── Gate 3: a real engine run grades green (scorecard.passing === total) ──────
if (args.run) {
  const key = args.key || process.env.ANTHROPIC_API_KEY;
  const miss = [["goal", args.goal], ["cta", args.cta], ["website", args.website]].filter(([, v]) => !v).map(([k]) => "--" + k);
  if (!base) record("scorecard green", false, "--run needs --url <base> (the app to POST to)");
  else if (!key) record("scorecard green", false, "--run needs ANTHROPIC_API_KEY (or --key)");
  else if (miss.length) record("scorecard green", false, `--run needs ${miss.join(", ")}`);
  else {
    try {
      const res = await fetch(`${base}/api/generate-week`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-anthropic-key": key },
        body: JSON.stringify({ goal: args.goal, cta: args.cta, website: args.website, eventWeekday: args.event || "Saturday", deepReview: !args.shallow }),
      });
      const data = await res.json().catch(() => ({}));
      const sc = data.scorecard;
      const ok = res.ok && sc && sc.total > 0 && sc.passing === sc.total;
      record("scorecard green", ok, sc ? `${sc.passing}/${sc.total} slots pass (${sc.fixed} auto-fixed)` : `no scorecard (HTTP ${res.status}: ${data.error || ""})`);
    } catch (e) {
      record("scorecard green", false, `run failed: ${e?.message || e}`);
    }
  }
} else {
  console.log("· scorecard green — skipped (pass --run --goal .. --cta .. --website .. to check)");
}

// ── Verdict ──────────────────────────────────────────────────────────────────
const ran = results.length;
const failed = results.filter((r) => !r.ok);
console.log("");
if (failed.length === 0) {
  console.log(`✅ DONE — ${ran}/${ran} gate(s) green. Verified by the model, no human needed.`);
  process.exit(0);
}
console.log(`❌ NOT DONE — ${failed.length}/${ran} gate(s) failed: ${failed.map((r) => r.name).join(", ")}`);
process.exit(1);
