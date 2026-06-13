// POST /api/review/:id/verdict   { pass: boolean, verdict?: VisualVerdict }
// Terminal call: approve (pass) or reject the asset and store the reviewer's
// VisualVerdict on the row.
import { NextRequest, NextResponse } from "next/server";
import { submitReview } from "@/lib/media-pipeline";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    if (typeof body?.pass !== "boolean")
      return NextResponse.json({ error: "pass (boolean) required" }, { status: 400 });
    const ok = await submitReview(id, { pass: body.pass, verdict: body.verdict });
    if (!ok) return NextResponse.json({ error: "no DB or update failed" }, { status: 502 });
    return NextResponse.json({ ok: true, status: body.pass ? "approved" : "rejected" });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
