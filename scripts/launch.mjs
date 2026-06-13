#!/usr/bin/env node
// scripts/launch.mjs — ONE-COMMAND RERUN of the Launch Control engine on any
// campaign. This is the "rerun on a new problem tomorrow" artifact: swap the
// three inputs, get a graded 7-day week back, and the process exits green ONLY
// when the engine's own self-grading scorecard reads passing === total.
//
//   node scripts/launch.mjs --goal "..." --cta "..." --website "https://..."
//
// It POSTs to a running app (default http://localhost:3000 — start it with
// `npm run dev`), so the planner, the critic loop, and docs/rubric.md are the
// exact same code the product runs — no duplicated orchestration. Needs an
// Anthropic key in the env (ANTHROPIC_API_KEY) or via --key, same as the app.
//
// Exit code: 0 = every slot passed (week is shippable). 1 = inputs missing,
// the run errored, or some slot still fails the rubric.

const FLAGS = new Set(["shallow", "json", "help"]);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (!a.startsWith("--")) continue;
    a = a.slice(2);
    const eq = a.indexOf("=");
    if (eq >= 0) { out[a.slice(0, eq)] = a.slice(eq + 1); continue; }
    if (FLAGS.has(a)) { out[a] = true; continue; }
    out[a] = argv[++i]; // --key value
  }
  return out;
}

const USAGE = `Launch Control — rerun the engine on any campaign.

  node scripts/launch.mjs --goal "<what you're trying to accomplish>" \\
                          --cta "<the call to action>" \\
                          --website "https://<the org's site>"

Options:
  --event <weekday>   the headline event day (default: Saturday)
  --url <base>        app base URL (default: http://localhost:3000)
  --key <anthropic>   Anthropic key (default: $ANTHROPIC_API_KEY)
  --shallow           skip the LLM fabrication/CTA pass (faster, deterministic only)
  --json              print the raw API JSON instead of the formatted scorecard
`;

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) { console.log(USAGE); process.exit(0); }

const goal = args.goal, cta = args.cta, website = args.website;
if (!goal || !cta || !website) {
  fail(`✗ Missing required input(s): ${[["goal", goal], ["cta", cta], ["website", website]]
    .filter(([, v]) => !v).map(([k]) => "--" + k).join(", ")}\n\n${USAGE}`);
}

const base = (args.url || "http://localhost:3000").replace(/\/+$/, "");
const key = args.key || process.env.ANTHROPIC_API_KEY;
if (!key) {
  fail("✗ No Anthropic key. Set ANTHROPIC_API_KEY or pass --key (the engine needs it, same as the app).");
}

const inputs = {
  goal, cta, website,
  eventWeekday: args.event || "Saturday",
  deepReview: !args.shallow,
};

console.log(`▶ Launch Control — rerunning the engine`);
console.log(`  goal:    ${goal}`);
console.log(`  cta:     ${cta}`);
console.log(`  website: ${website}`);
console.log(`  via:     POST ${base}/api/generate-week  (deepReview=${inputs.deepReview})\n  …planning + writing + self-grading a 7-day week (this takes a bit on a cold run)…\n`);

let res;
try {
  res = await fetch(`${base}/api/generate-week`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-anthropic-key": key },
    body: JSON.stringify(inputs),
  });
} catch (e) {
  fail(`✗ Could not reach ${base} — is the app running? (npm run dev)\n  ${e?.message || e}`);
}

const text = await res.text();
let data;
try { data = JSON.parse(text); } catch { fail(`✗ ${base} returned non-JSON (HTTP ${res.status}):\n${text.slice(0, 400)}`); }

if (!res.ok || data.error) fail(`✗ Engine error (HTTP ${res.status}): ${data.error || text.slice(0, 400)}`);

if (args.json) { console.log(JSON.stringify(data, null, 2)); }

const { plan, scorecard } = data;
if (!scorecard) fail(`✗ No scorecard in the response — unexpected shape:\n${text.slice(0, 400)}`);

if (!args.json && plan?.days) {
  console.log(`  brand: ${plan.brand?.name || "?"}  —  ${plan.brand?.voice || ""}`.trimEnd());
  for (const day of plan.days) {
    const pass = day.slots.filter((s) => s.grade?.pass).length;
    const flag = pass === day.slots.length ? "✓" : "✗";
    console.log(`  ${flag} Day ${day.day} (${day.weekday})  ${pass}/${day.slots.length}  — ${day.theme || ""}`);
    for (const s of day.slots) {
      if (!s.grade?.pass) console.log(`      ✗ ${s.platform}/${s.contentType}: ${(s.grade?.failures || []).join("; ")}`);
    }
  }
  console.log("");
}

const { total, passing, fixed } = scorecard;
const green = total > 0 && passing === total;
console.log(`${green ? "✅" : "❌"} Scorecard: ${passing}/${total} slots pass the rubric  (${fixed} auto-fixed by the critic)`);
console.log(green
  ? "   Week is shippable — every slot is green. Swap the three inputs to rerun on the next campaign."
  : "   Not done — some slots still fail. See the ✗ lines above.");
process.exit(green ? 0 : 1);
