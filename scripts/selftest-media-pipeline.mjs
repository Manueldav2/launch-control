// End-to-end self-test for the media-passing pipeline (docs/media-pipeline.md).
// Drives the REAL routes against a running dev server, exercising the whole
// create → store → review → (optional) regenerate contract.
//
//   1. npm run dev            (in another terminal)
//   2. run docs/supabase-schema.sql in the Supabase SQL editor (once)
//   3. node scripts/selftest-media-pipeline.mjs            (cheap: one image)
//      node scripts/selftest-media-pipeline.mjs --regen    (also re-renders, $)
//
// An image render is ~$0.01 and cached, so re-runs are free. Pass --regen to
// also exercise a fal video/image regeneration (spends again).
const BASE = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
const REGEN = process.argv.includes("--regen");
const ORG = "selftest";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
}
async function j(res) { try { return await res.json(); } catch { return {}; }

}

async function main() {
  // 1. Create — render an image slot and enqueue it for review.
  const genRes = await fetch(`${BASE}/api/generate-media`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contentType: "image",
      prompt: "a friendly volunteer waving on a sunny beach, candid, natural light",
      intent: "warm invite to a Saturday beach cleanup",
      brandColors: ["#0ea5e9", "#f8fafc"],
      org: ORG, slot: "1:instagram", platform: "instagram", day: "1", brand: "Selftest Co",
    }),
  });
  const gen = await j(genRes);
  check("POST /api/generate-media renders", genRes.ok && !!gen.url, gen.error || gen.url?.slice(0, 60));
  check("asset persisted to Supabase Storage", gen.persisted === true, `persisted=${gen.persisted}`);
  check("asset queued (got assetId)", !!gen.assetId, `assetId=${gen.assetId}`);
  check("public_url is a Supabase url", typeof gen.url === "string" && gen.url.includes("supabase"), gen.url?.slice(0, 50));

  // 2. Claim — the reviewer pulls the oldest pending asset.
  const nextRes = await fetch(`${BASE}/api/review/next?reviewer=selftest&org=${ORG}`);
  const next = await j(nextRes);
  const claimed = next.asset;
  check("GET /api/review/next claims an asset", !!claimed, claimed ? `id=${claimed.id} status=${claimed.status}` : "queue empty");
  check("claimed asset is in_review", claimed?.status === "in_review");
  check("claimed asset carries prompt+intent (judgeable)", !!claimed?.prompt && !!claimed?.intent);

  let regenId = null;
  if (claimed && REGEN) {
    // 3a. Regenerate — reviewer sends an adjusted prompt, gets a child version.
    const regRes = await fetch(`${BASE}/api/review/${claimed.id}/regenerate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "a volunteer holding a reusable bag, smiling, golden hour" }),
    });
    const reg = await j(regRes);
    regenId = reg.assetId;
    check("POST /regenerate makes a child version", regRes.ok && !!reg.assetId, reg.error || `child=${reg.assetId}`);
  }

  // 3/4. Verdict — approve the claimed asset.
  if (claimed) {
    const vRes = await fetch(`${BASE}/api/review/${claimed.id}/verdict`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pass: true, verdict: { pass: true, onBrand: true, matchesIntent: true, clean: true, issues: [], notes: "selftest" } }),
    });
    const v = await j(vRes);
    check("POST /verdict approves", vRes.ok && v.status === "approved", v.error || v.status);
  }

  // 5. Gallery — approved asset shows when filtering status=approved.
  const galRes = await fetch(`${BASE}/api/assets?org=${ORG}&status=approved`);
  const gal = await j(galRes);
  const found = (gal.assets || []).some((a) => a.id === claimed?.id || a.url === gen.url);
  check("GET /api/assets?status=approved shows it", found, `${(gal.assets || []).length} approved assets`);

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`}  (regen ${REGEN ? "on" : "off"})`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("selftest crashed:", e); process.exit(1); });
