// One unit of review work, and a small batch of them. This is the glue: claim a
// pending row → look at the image → write the verdict back, with the queue
// kept honest (transient failures requeue, lost ownership no-ops).
import {
  claimNext,
  claimNextViaPatch,
  writeVerdict,
  releaseClaim,
  type QueueStats,
} from "./client";
import { critique, decideVerdict, buildReview, type CritiqueOpts } from "./critic";
import type { AssetRow, AssetStatus } from "./contract";

export interface ReviewerConfig {
  reviewerId: string;
  org?: string;
  maxVersions: number;
  pollMs: number;
  claimTtlMs: number;
}

// A bad/non-numeric env var must never poison the loop: NaN poll → hot-spin,
// NaN ttl → reclaimStale's Date math throws, NaN cap → regen never stops. So
// every numeric env falls back to its default unless it parses to a positive number.
function numEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function configFromEnv(): ReviewerConfig {
  return {
    reviewerId: process.env.REVIEWER_ID || `critic-${process.pid}`,
    org: process.env.REVIEW_ORG?.trim() || undefined,
    maxVersions: numEnv("REVIEW_MAX_VERSIONS", 3),
    pollMs: numEnv("REVIEW_POLL_MS", 4000),
    // 5 min: comfortably longer than a vision critique (~60s) so a slow review
    // is never reclaimed out from under itself.
    claimTtlMs: numEnv("REVIEW_CLAIM_TTL_MS", 300000),
  };
}

export interface ReviewOutcome {
  claimed: boolean;
  assetId?: string;
  org?: string;
  version?: number;
  verdict?: AssetStatus;
  method?: "vision" | "heuristic";
  issues?: string[];
  wrote?: boolean;
  error?: string;
}

// Try the partner's atomic RPC; if it isn't deployed, fall back to the pure
// optimistic-concurrency claim. Either way the row comes back marked 'reviewing'.
async function claim(cfg: ReviewerConfig): Promise<AssetRow | null> {
  try {
    return await claimNext(cfg.reviewerId, cfg.org);
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (/claim_next_asset/.test(msg) && /(does not exist|not found|PGRST202|schema cache)/i.test(msg))
      return claimNextViaPatch(cfg.reviewerId, cfg.org);
    throw e;
  }
}

// Review exactly one asset. Returns {claimed:false} when the queue is empty.
export async function reviewOne(
  cfg: ReviewerConfig,
  opts: CritiqueOpts = {},
): Promise<ReviewOutcome> {
  const row = await claim(cfg);
  if (!row) return { claimed: false };

  try {
    const report = await critique(row, opts);
    const verdict = decideVerdict(report, row.version, cfg.maxVersions);
    const review = buildReview(report, verdict, cfg.reviewerId);
    const wrote = await writeVerdict(row, verdict, review);
    return {
      claimed: true,
      assetId: row.id,
      org: row.org,
      version: row.version,
      verdict,
      method: report.method,
      issues: report.issues,
      wrote, // false = lost ownership (e.g. stale-reclaimed) — verdict dropped, safe
    };
  } catch (e: any) {
    // Transient (image 404, network) — don't poison the row; put it back.
    await releaseClaim(row.id, cfg.reviewerId).catch(() => {});
    return { claimed: true, assetId: row.id, error: String(e?.message || e), wrote: false };
  }
}

// Drain up to `max` rows this tick; stops early when the queue runs dry.
export async function reviewBatch(
  cfg: ReviewerConfig,
  max: number,
  opts: CritiqueOpts = {},
): Promise<ReviewOutcome[]> {
  const out: ReviewOutcome[] = [];
  for (let i = 0; i < max; i++) {
    const r = await reviewOne(cfg, opts);
    if (!r.claimed) break;
    out.push(r);
  }
  return out;
}

export type { QueueStats };
