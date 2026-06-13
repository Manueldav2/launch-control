// Publish to the connected social accounts via Zernio.
//
//  • Single slot:  POST { accountId, platform, text, mediaUrl?, mediaType?, scheduledFor? }
//  • Whole week:   POST { plan, mode?: "schedule" | "now", baseDate? }
//      routes every slot to its channels (lib/channels), intersects with the
//      connected accounts, and publishes (or schedules across the week). IG/TikTok
//      slots without rendered media are reported under `skipped`, not posted.
import { NextRequest, NextResponse } from "next/server";
import { publish, resolveProfileId, connectedChannels } from "@/lib/zernio";
import { buildPublishPlan, scheduleAt, type PlanDayLike } from "@/lib/channels";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── Whole-week batch ────────────────────────────────────────────────────
    if (body.plan?.days) {
      const mode: "schedule" | "now" = body.mode === "now" ? "now" : "schedule";
      const profileId = await resolveProfileId();
      const connected = await connectedChannels(profileId); // [{channel, accountId, ...}]
      const { targets, skipped } = buildPublishPlan(body.plan.days as PlanDayLike[], connected);

      if (!targets.length) {
        return NextResponse.json({
          published: 0, total: 0, results: [], skipped,
          connectedChannels: connected.map((c) => c.channel),
          note: connected.length ? "Nothing routable yet (render media for Instagram/TikTok)." : "No channels connected.",
        });
      }

      const base = body.baseDate ? new Date(body.baseDate) : new Date();
      // count posts per day so same-day posts stagger
      const seenPerDay: Record<number, number> = {};
      const results: any[] = [];
      for (const t of targets) {
        const n = (seenPerDay[t.day] = (seenPerDay[t.day] || 0) + 1) - 1;
        const scheduledFor = mode === "schedule" ? scheduleAt(t.day, n, base) : undefined;
        const summary = { day: t.day, weekday: t.weekday, channel: t.channel, contentType: t.contentType, hasMedia: !!t.mediaUrl, scheduledFor };
        try {
          const r = await publish({
            accountId: t.accountId, platform: t.channel, text: t.text,
            mediaUrl: t.mediaUrl, mediaType: t.mediaType, scheduledFor,
          });
          results.push({ ...summary, ok: true, id: r?.id || r?._id || r?.postId || null });
        } catch (e: any) {
          results.push({ ...summary, ok: false, error: String(e?.message || e).slice(0, 200) });
        }
      }
      return NextResponse.json({
        published: results.filter((r) => r.ok).length,
        total: targets.length,
        mode,
        results,
        skipped,
        connectedChannels: connected.map((c) => c.channel),
      });
    }

    // ── Single slot (back-compat) ────────────────────────────────────────────
    const { accountId, platform, text, mediaUrl, mediaType, scheduledFor } = body;
    if (!accountId || !platform || !text)
      return NextResponse.json({ error: "accountId, platform, text required" }, { status: 400 });
    const result = await publish({ accountId, platform, text, mediaUrl, mediaType, scheduledFor });
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
