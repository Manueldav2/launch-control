// GET /api/review/next?reviewer=<id>&org=<org>
// The seam: the partner's review session claims the oldest pending_review asset
// (atomic FOR UPDATE SKIP LOCKED), which flips it to in_review. Returns the full
// self-describing row — play public_url, look at poster_url, judge against
// prompt/intent/brand_colors. { asset: null } when the queue is empty.
import { NextRequest, NextResponse } from "next/server";
import { claimNextForReview } from "@/lib/media-pipeline";
import { dbEnabled } from "@/lib/store";

export async function GET(req: NextRequest) {
  const reviewer = req.nextUrl.searchParams.get("reviewer") || "reviewer";
  const org = req.nextUrl.searchParams.get("org") || undefined;
  const asset = await claimNextForReview(reviewer, org);
  return NextResponse.json({ db: dbEnabled(), asset });
}
