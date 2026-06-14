// Batch media render. One call renders EVERY missing media slot for a plan in
// parallel (server-side), persists each to storage, and returns the plan with
// the media URLs filled. Replaces the client firing one request per slot. Open
// access (no account); own fal key (x-fal-key) bypasses the host's key + quota,
// guarded by the global fal spend cap.
import { NextRequest, NextResponse } from "next/server";
import { renderMedia } from "@/lib/media-gen";
import { enqueueAsset } from "@/lib/media-pipeline";
import { spentSoFar } from "@/lib/fal";
import { runWithKeys } from "@/lib/request-keys";

export const maxDuration = 300;

const isMedia = (ct: string) => ct === "image" || ct === "ugc_video" || ct === "motion_video";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const plan = body.plan;
    if (!plan?.days) return NextResponse.json({ error: "plan required" }, { status: 400 });

    const userFalKey = (req.headers.get("x-fal-key") || body.falKey || "").trim();
    const colors: string[] = Array.isArray(plan.brand?.colors) ? plan.brand.colors.slice(0, 3) : [];
    const location = plan.inputs?.location;
    const org = plan.brand?.name || "demo";

    // Every media slot still missing its render.
    const jobs: { di: number; si: number; s: any; weekday: string }[] = [];
    plan.days.forEach((day: any, di: number) =>
      (day.slots || []).forEach((s: any, si: number) => {
        if (isMedia(s.contentType) && !s.mediaUrl) jobs.push({ di, si, s, weekday: day.weekday });
      }),
    );

    let rendered = 0, failed = 0;
    let idx = 0;
    const CONCURRENCY = Math.min(6, jobs.length);
    const worker = async () => {
      while (idx < jobs.length) {
        const { di, si, s, weekday } = jobs[idx++];
        try {
          const doRender = () => renderMedia({ contentType: s.contentType, prompt: s.mediaPrompt || s.copy, intent: s.reaction, brandColors: colors, location });
          const { url, stillUrl } = userFalKey ? await runWithKeys({ FAL_KEY: userFalKey }, doRender) : await doRender();
          const queued = await enqueueAsset({
            url, contentType: s.contentType, org, platform: s.platform, day: weekday, brand: org,
            caption: (s.copy || "").slice(0, 120), slot: `${weekday}:${s.platform}`, planId: plan.createdAt,
            prompt: s.mediaPrompt || s.copy, intent: s.reaction, brandColors: colors, location, posterUrl: stillUrl,
          });
          plan.days[di].slots[si].mediaUrl = queued.publicUrl;
          rendered++;
        } catch { failed++; }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, worker));

    return NextResponse.json({ plan, rendered, failed, total: jobs.length, spentUsd: spentSoFar() });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e), spentUsd: spentSoFar() }, { status: 500 });
  }
}
