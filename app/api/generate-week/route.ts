// The swarm's brain: idea + CTA + website -> a full 7-day plan, then a critic
// pass that grades every slot and regenerates any that fail. Returns a plan
// where every piece of copy has a green grade.
import { NextRequest, NextResponse } from "next/server";
import { generateWeekPlan, gradeSlot, fixSlotCopy } from "@/lib/anthropic";
import type { WeekInputs } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<WeekInputs>;
    if (!body.goal || !body.cta || !body.website)
      return NextResponse.json({ error: "goal, cta, and website are required" }, { status: 400 });

    const inputs: WeekInputs = {
      goal: body.goal, cta: body.cta, website: body.website,
      eventWeekday: body.eventWeekday || "Saturday",
    };

    const plan = await generateWeekPlan(inputs);

    // Critic loop: grade every slot, rewrite the failures once, re-grade.
    let fixed = 0;
    for (const day of plan.days) {
      for (const slot of day.slots) {
        let grade = gradeSlot(slot);
        if (!grade.pass) {
          try {
            slot.copy = await fixSlotCopy(slot, grade.failures);
            grade = gradeSlot(slot);
            fixed++;
          } catch {
            /* keep original + its failing grade */
          }
        }
        slot.grade = grade;
      }
    }

    const total = plan.days.reduce((n, d) => n + d.slots.length, 0);
    const passing = plan.days.reduce(
      (n, d) => n + d.slots.filter((s) => s.grade?.pass).length, 0);

    return NextResponse.json({ plan, scorecard: { total, passing, fixed } });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
