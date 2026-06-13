// The long-running reviewer: poll → drain the queue → sleep → repeat, recovering
// crashed claims along the way. Decoupled from the generator entirely; it only
// speaks the `assets` table contract. Run it with `npm run review`.
import { reclaimStale, queueStats } from "./client";
import { reviewBatch, configFromEnv, type ReviewerConfig } from "./reviewer";
import type { CritiqueOpts } from "./critic";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface WorkerHooks {
  log?: (line: string) => void;
  signal?: AbortSignal; // abort to stop after the current tick
}

// One pass: recover stale claims, then drain up to `batch` rows. Returns how
// many it reviewed so the loop knows whether to sleep or keep draining.
export async function tick(
  cfg: ReviewerConfig,
  opts: CritiqueOpts,
  batch: number,
  log: (s: string) => void,
): Promise<number> {
  const recovered = await reclaimStale(cfg.claimTtlMs).catch((e) => {
    log(`reclaim error: ${e?.message || e}`);
    return 0;
  });
  if (recovered) log(`requeued ${recovered} stale claim(s)`);

  const outcomes = await reviewBatch(cfg, batch, opts);
  for (const o of outcomes) {
    if (o.error) log(`✗ ${o.assetId} error → requeued: ${o.error}`);
    else
      log(
        `${o.verdict === "approved" ? "✓" : o.verdict === "regenerated" ? "↻" : "✗"} ` +
          `${o.assetId} v${o.version} → ${o.verdict} [${o.method}]` +
          (o.issues?.length ? ` — ${o.issues.slice(0, 2).join("; ")}` : "") +
          (o.wrote === false ? " (write skipped: ownership lost)" : ""),
      );
  }
  return outcomes.length;
}

// Poll forever (until the abort signal fires). Drains fast when there's work,
// backs off to cfg.pollMs when the queue is empty.
export async function runWorker(
  cfg: ReviewerConfig = configFromEnv(),
  opts: CritiqueOpts = {},
  hooks: WorkerHooks = {},
): Promise<void> {
  const log = hooks.log || ((s) => console.log(`[${new Date().toISOString()}] ${s}`));
  const batch = 8;
  const stats = await queueStats(cfg.org).catch(() => null);
  log(
    `reviewer "${cfg.reviewerId}" online` +
      (cfg.org ? ` (org=${cfg.org})` : " (all orgs)") +
      `, maxVersions=${cfg.maxVersions}` +
      (stats ? ` — queue: ${stats.pending} pending, ${stats.reviewing} in review` : ""),
  );
  while (!hooks.signal?.aborted) {
    let n = 0;
    try {
      n = await tick(cfg, opts, batch, log);
    } catch (e: any) {
      log(`tick error: ${e?.message || e}`);
    }
    if (hooks.signal?.aborted) break;
    if (n === 0) await sleep(cfg.pollMs); // queue empty → back off
  }
  log("reviewer stopped");
}
