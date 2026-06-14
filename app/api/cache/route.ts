// Cache a finished launch keyed by its inputs, so the next identical brief loads
// instantly for anyone. The client calls this the moment a week finishes
// generating, and again after media renders, so the cached plan carries the
// rendered media URLs too. Writing requires sign-in (reading the cache, in
// /api/generate-week, does not).
import { NextRequest, NextResponse } from "next/server";
import { cacheKeyFor, setCached } from "@/lib/demo-cache";
import { userIdFromRequest } from "@/lib/auth-server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const userId = await userIdFromRequest(req);
    if (!userId) return NextResponse.json({ error: "sign in to cache" }, { status: 401 });
    const { inputs, plan, scorecard } = await req.json();
    if (!plan || !inputs?.goal) return NextResponse.json({ error: "inputs + plan required" }, { status: 400 });
    const key = cacheKeyFor(inputs);
    await setCached(key, { plan, scorecard: scorecard ?? null });
    return NextResponse.json({ ok: true, key });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
