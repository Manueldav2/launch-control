// The swarm's brain: idea + CTA + website -> a full 7-day plan, then a critic
// pass that grades every slot and regenerates any that fail. Returns a plan
// where every piece of copy has a green grade.
import { NextRequest, NextResponse } from "next/server";
import { generateWeekPlan } from "@/lib/anthropic";
import { gradeSlot, gradeSlotLLM, fixSlotCopy } from "@/lib/critic";
import { fixRender } from "@/lib/visual-critic";
import { generateImage } from "@/lib/fal";
import type { WeekInputs, ContentType } from "@/lib/types";

export const maxDuration = 300;

// Bake the brand palette (+ launch-film motion) into a render prompt, mirroring
// app/api/generate-media so a still graded here matches what that route renders.
function brandedPrompt(prompt: string, colors: string[], contentType: ContentType): string {
  const pal = (colors || []).slice(0, 3);
  const palette = pal.length
    ? `\n\nBrand palette to feature naturally in the scene (signage, clothing, props, on-screen text), never as floating swatches: ${pal.join(", ")}.`
    : "";
  const motion = contentType === "motion_video"
    ? "\n\nMotion style: kinetic launch energy — punchy camera moves, quick reveals, hype-cut feel. Bold and modern."
    : "";
  return `${prompt}${palette}${motion}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<WeekInputs> & { deepReview?: boolean; renderMedia?: boolean; apiKey?: string };
    if (!body.goal || !body.cta || !body.website)
      return NextResponse.json({ error: "goal, cta, and website are required" }, { status: 400 });

    // The Anthropic key may come from the UI (header or body) and overrides env.
    const apiKey = req.headers.get("x-anthropic-key") || body.apiKey || undefined;

    const inputs: WeekInputs = {
      goal: body.goal, cta: body.cta, website: body.website,
      eventWeekday: body.eventWeekday || "Saturday",
    };

    const plan = await generateWeekPlan(inputs, apiKey);

    // Critic loop: grade every slot (deterministic + LLM checks), rewrite the
    // failures once, re-grade. `deep=true` adds the LLM fabrication/CTA pass.
    // Every slot is independent, so the whole critic pass runs CONCURRENTLY —
    // 21 slots graded in parallel instead of one-after-another (cold latency
    // drops from ~85s toward the cost of a single slot's grade+fix).
    const deep = body.deepReview !== false;
    let fixed = 0;
    await Promise.all(
      plan.days.flatMap((day) =>
        day.slots.map(async (slot) => {
          const det = gradeSlot(slot);
          const llm = deep ? await gradeSlotLLM(slot, day.cta, apiKey) : [];
          let failures = [...det.failures, ...llm];
          if (failures.length) {
            try {
              slot.copy = await fixSlotCopy(slot, failures, apiKey);
              const det2 = gradeSlot(slot);
              const llm2 = deep ? await gradeSlotLLM(slot, day.cta, apiKey) : [];
              failures = [...det2.failures, ...llm2];
              fixed++;
            } catch {
              /* keep original + its failing grade */
            }
          }
          slot.grade = { pass: failures.length === 0, failures };
        }),
      ),
    );

    // Optional VISUAL review pass (off by default so the text path stays fast).
    // The image analog of the copy loop above: render each media slot's still,
    // let the visual critic grade it, and self-correct a failing render via
    // fixRender. Only STILLS are rendered here (cheap, and the correct frame to
    // critique), so this never touches the fal video spend ceiling.
    let mediaTotal = 0, mediaPassing = 0;
    if (body.renderMedia) {
      const mediaSlots = plan.days.flatMap((day) =>
        day.slots.filter((s) => s.contentType !== "text" && s.mediaPrompt?.trim()));
      mediaTotal = mediaSlots.length;
      await Promise.all(
        mediaSlots.map(async (slot) => {
          try {
            const branded = brandedPrompt(slot.mediaPrompt!, plan.brand.colors, slot.contentType);
            const first = await generateImage(branded);
            const fix = await fixRender({
              imageUrl: first, prompt: branded, intent: slot.mediaPrompt!,
              brandColors: plan.brand.colors, apiKey,
            });
            slot.mediaUrl = fix.imageUrl;   // the graded still (keyframe for video slots)
            slot.visualGrade = fix.verdict;
          } catch {
            /* a render/critic infra failure leaves the slot ungraded, never crashes the week */
          }
        }),
      );
      mediaPassing = mediaSlots.filter((s) => s.visualGrade?.pass).length;
    }

    const total = plan.days.reduce((n, d) => n + d.slots.length, 0);
    const passing = plan.days.reduce(
      (n, d) => n + d.slots.filter((s) => s.grade?.pass).length, 0);

    // Copy scorecard is unchanged (frontend-safe); media counts are added only
    // when the visual pass ran. A week is fully green when passing===total AND
    // mediaPassing===mediaTotal.
    const scorecard = body.renderMedia
      ? { total, passing, fixed, mediaTotal, mediaPassing }
      : { total, passing, fixed };

    return NextResponse.json({ plan, scorecard });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
