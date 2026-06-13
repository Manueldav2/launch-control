// The reviewer as an HTTP surface — for running it serverless (a cron hits
// POST every minute) instead of as a long-lived worker, and for peeking at the
// queue. Same engine as scripts/review-worker.ts; both just call into
// lib/review. Decoupled from creation: it only ever touches the `assets` table.
import { NextRequest, NextResponse } from "next/server";
import { configFromEnv, reviewBatch } from "@/lib/review/reviewer";
import { reclaimStale, queueStats } from "@/lib/review/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/review → queue snapshot.
export async function GET(req: NextRequest) {
  const org = req.nextUrl.searchParams.get("org") || configFromEnv().org;
  try {
    return NextResponse.json({ ok: true, org: org || null, queue: await queueStats(org) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

// POST /api/review → run one batch (recover stale claims, then drain up to
// `batch` rows). Wire a Vercel/Supabase cron to this for a serverless reviewer.
// Body/query: { batch?: number, heuristic?: boolean, apiKey?: string }.
//
// Auth: if REVIEW_CRON_SECRET is set, the request must carry it (Authorization:
// Bearer <secret> or x-review-secret). Unset = open (matches the demo app), but
// set it in production so nobody can trigger expensive vision runs at will.
export async function POST(req: NextRequest) {
  const secret = process.env.REVIEW_CRON_SECRET;
  if (secret) {
    const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || req.headers.get("x-review-secret");
    if (got !== secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const cfg = configFromEnv();
  const sp = req.nextUrl.searchParams;
  const body = await req.json().catch(() => ({}) as any);
  // Bound the batch so a bogus/huge/NaN value can't spin the loop (DoS).
  const rawBatch = Number(body.batch ?? sp.get("batch") ?? 8);
  const batch = Number.isFinite(rawBatch) ? Math.min(Math.max(Math.floor(rawBatch), 1), 100) : 8;
  const forceHeuristic = body.heuristic ?? sp.get("heuristic") === "true";
  const apiKey = body.apiKey || req.headers.get("x-anthropic-key") || undefined;

  try {
    const recovered = await reclaimStale(cfg.claimTtlMs);
    const outcomes = await reviewBatch(cfg, batch, { forceHeuristic, apiKey });
    return NextResponse.json({
      ok: true,
      reviewer: cfg.reviewerId,
      recovered,
      reviewed: outcomes.length,
      outcomes,
      queue: await queueStats(cfg.org),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
