// Standalone image-critic worker. Run it next to the generator (or anywhere
// with network + the keys) — it's a pure consumer of the `assets` queue.
//
//   npm run review                 # poll forever, drain the queue
//   npm run review -- --once       # process one batch and exit (cron/CI)
//   npm run review -- --heuristic  # skip the vision model (no Anthropic key)
//   npm run review -- --batch=20   # rows per tick
//
// Env comes from .env.local / .env (SUPABASE_URL, SUPABASE_SERVICE_KEY,
// ANTHROPIC_API_KEY, REVIEWER_ID, REVIEW_* — see .env.example).
import { runWorker, tick } from "../lib/review/worker";
import { configFromEnv } from "../lib/review/reviewer";
import { queueStats } from "../lib/review/client";

// Node 24: load env files ourselves (this isn't a Next.js process).
for (const f of [".env.local", ".env"]) {
  try {
    (process as any).loadEnvFile(f);
  } catch {
    /* file absent — fine */
  }
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf("=");
  return eq === -1 ? "true" : hit.slice(eq + 1);
}

async function main() {
  const once = !!arg("once");
  const forceHeuristic = !!arg("heuristic");
  const rawBatch = Number(arg("batch") || 8);
  if (!Number.isFinite(rawBatch) || rawBatch < 1) {
    console.error(`Invalid --batch value: ${arg("batch")}`);
    process.exit(1);
  }
  const batch = Math.min(Math.floor(rawBatch), 100);
  const cfg = configFromEnv();
  const opts = { forceHeuristic };
  const log = (s: string) => console.log(`[${new Date().toISOString()}] ${s}`);

  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY)) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY — copy .env.example to .env.local.");
    process.exit(1);
  }
  if (forceHeuristic) log("forced heuristic mode (no vision)");
  else if (!process.env.ANTHROPIC_API_KEY) log("no ANTHROPIC_API_KEY — will use heuristic inspection");

  if (once) {
    const n = await tick(cfg, opts, batch, log);
    const stats = await queueStats(cfg.org);
    log(`done: reviewed ${n} this run. queue now: ${JSON.stringify(stats)}`);
    process.exit(0);
  }

  const ac = new AbortController();
  for (const sig of ["SIGINT", "SIGTERM"] as const)
    process.on(sig, () => {
      log(`${sig} — finishing current tick then exiting`);
      ac.abort();
    });
  await runWorker(cfg, opts, { signal: ac.signal, log });
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
