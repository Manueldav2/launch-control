// LIVE end-to-end proof of the producer half: upload a render into Supabase
// Storage + enqueue a pending_review row, then let the reviewer claim & critique
// it — the full creation→queue→review loop, in this repo, against the real DB.
// Throwaway org so it's easy to purge. Run: tsx scripts/e2e-producer.ts
for (const f of [".env.local", ".env"]) { try { (process as any).loadEnvFile(f); } catch {} }

import { enqueueForReview } from "../lib/store";
import { reviewOne, configFromEnv } from "../lib/review/reviewer";
import { queueStats, reviewerDb } from "../lib/review/client";
import { MEDIA_BUCKET } from "../lib/storage";

const ORG = "e2e-test";
// A real, already-rendered fal image (reused from an existing queue row) — we're
// proving the upload+enqueue+review path, not re-paying to render.
const SOURCE = "https://v3b.fal.media/files/b/0a9e2dc7/f-hIrFASlgxrVhiq6vSx9.jpg";

async function main() {
  const log = (s: string) => console.log(`[e2e] ${s}`);

  log("1) enqueueForReview → upload to Storage + insert pending_review row");
  const q = await enqueueForReview({
    sourceUrl: SOURCE,
    contentType: "image",
    org: ORG,
    prompt: "wide shot of a clean beach with smiling volunteers holding bags",
    brandColors: ["#0a6cff", "#08c"],
    platform: "instagram",
    slot: "e2e",
  });
  if (!q) { log("no DB configured — aborting"); process.exit(1); }
  log(`   → row ${q.id}`);
  log(`   → storage_path ${q.storagePath}`);
  log(`   → public_url ${q.publicUrl}`);
  log(`   → status ${q.status}`);

  log("2) reviewer claims the e2e queue + critiques (heuristic)");
  const cfg = { ...configFromEnv(), org: ORG, reviewerId: "e2e-reviewer" };
  const outcome = await reviewOne(cfg, { forceHeuristic: true });
  log(`   → ${JSON.stringify(outcome)}`);

  log(`3) e2e queue stats: ${JSON.stringify(await queueStats(ORG))}`);
  const pass = outcome.assetId === q.id && outcome.wrote;
  log(pass ? "PASS ✓ full producer→review loop works" : "CHECK ✗ unexpected outcome");

  log("4) cleanup → remove the e2e storage object + row (safe to re-run)");
  const db = reviewerDb();
  await db.storage.from(MEDIA_BUCKET).remove([q.storagePath]);
  await db.from("assets").delete().eq("org", ORG);
  log(`   → cleaned. e2e queue now: ${JSON.stringify(await queueStats(ORG))}`);
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
