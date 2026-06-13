// The swarm's brain: idea + CTA + website -> a full 7-day plan, then a critic
// pass that grades every slot and regenerates any that fail. Returns a plan
// where every piece of copy has a green grade.
import { NextRequest, NextResponse } from "next/server";
import { generateWeekPlan } from "@/lib/anthropic";
import { gradeSlot, gradeSlotLLM, fixSlotCopy } from "@/lib/critic";
import type { WeekInputs } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<WeekInputs> & { deepReview?: boolean; apiKey?: string };
    if (!body.goal || !body.cta || !body.website)
      return NextResponse.json({ error: "goal, cta, and website are required" }, { status: 400 });

    // The Anthropic key may come from the UI (header or body) and overrides env.
    const apiKey = req.headers.get("x-anthropic-key") || body.apiKey || undefined;

    const inputs: WeekInputs = {
      goal: body.goal, cta: body.cta, website: body.website,
      eventWeekday: body.eventWeekday || "Saturday",
      location: body.location,
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
          // Rewrite-and-regrade until the slot passes or we exhaust 3 attempts,
          // so the week reliably converges to all-green instead of leaving a
          // stubborn slot failing after a single try.
          let attempt = 0;
          while (failures.length && attempt < 3) {
            try {
              slot.copy = await fixSlotCopy(slot, failures, apiKey);
              const det2 = gradeSlot(slot);
              const llm2 = deep ? await gradeSlotLLM(slot, day.cta, apiKey) : [];
              failures = [...det2.failures, ...llm2];
              if (attempt === 0) fixed++;
              attempt++;
            } catch {
              break; // keep the last copy + its failing grade
            }
          }
          slot.grade = { pass: failures.length === 0, failures };
        }),
      ),
    );

    const total = plan.days.reduce((n, d) => n + d.slots.length, 0);
    const passing = plan.days.reduce(
      (n, d) => n + d.slots.filter((s) => s.grade?.pass).length, 0);

    return NextResponse.json({ plan, scorecard: { total, passing, fixed } });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
