"use client";

/**
 * Plan bridge for the calendar route.
 *
 * The home page holds the generated WeekPlan in React state; it isn't a global.
 * Rather than reach into the home page (another session's lane), we bridge via
 * localStorage: the home page writes the plan with savePlanLocal(plan) the
 * moment it lands, and the calendar reads it with loadPlanLocal(). The calendar
 * also ships a DEMO_WEEK so the route renders something real even before a plan
 * has been generated.
 */

import type { WeekPlan } from "@/lib/types";

export const LC_PLAN_KEY = "lc_week_plan";

// Accepts the plan as the home page holds it (a structural subset of WeekPlan);
// this is a localStorage serializer, so it stays tolerant of the exact shape.
export function savePlanLocal(plan: WeekPlan | unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LC_PLAN_KEY, JSON.stringify(plan));
  } catch {
    /* quota / privacy mode — calendar falls back to demo */
  }
}

export function loadPlanLocal(): WeekPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LC_PLAN_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && Array.isArray(p.days)) return p as WeekPlan;
    return null;
  } catch {
    return null;
  }
}

// ── demo week (beach-cleanup nonprofit) ───────────────────────────────────────
// Mirrors the canonical sample on the home page so the calendar reads true.

const g = (failures: string[] = []) => ({ pass: failures.length === 0, failures });

export const DEMO_WEEK: WeekPlan = {
  createdAt: "2026-01-01T00:00:00.000Z",
  inputs: {
    goal: "Fill a Saturday beach cleanup with volunteers",
    cta: "RSVP for Saturday, 9am, Ocean Beach north lot",
    website: "https://example-coast.org",
  },
  brand: {
    name: "Coastline Collective",
    mission: "Keep California's beaches clean, one Saturday at a time.",
    voice: "Warm, direct, a little dry. Proof over hype.",
    colors: ["#0e7490", "#f59e0b"],
    summary:
      "A volunteer-run nonprofit that organizes monthly beach cleanups along the California coast.",
  },
  days: [
    {
      day: 1,
      weekday: "Monday",
      theme: "Open with a number that stops the scroll",
      cta: "Save the date: Saturday 9am",
      isEventDay: false,
      slots: [
        { platform: "x", reaction: "A number that stops the scroll", contentType: "text", copy: "Two tons of plastic came off Ocean Beach last spring. Saturday we go back for the rest. 9am, north lot. Bring a friend.", grade: g() },
        { platform: "instagram", reaction: "Makes you feel the stakes", contentType: "image", copy: "What one tide leaves behind.", mediaPrompt: "documentary photo of plastic debris on a foggy California beach at dawn, muted tones", grade: g() },
      ],
    },
    {
      day: 2,
      weekday: "Tuesday",
      theme: "Reframe the cleanup as a ritual worth joining",
      cta: "Save the date: Saturday 9am",
      isEventDay: false,
      slots: [
        { platform: "linkedin", reaction: "Reframes a cleanup as the best team ritual", contentType: "text", copy: "We give the team one Saturday a month on the sand. It is the only standup where nobody checks their phone. Here is why we keep doing it.", grade: g(["softened a humblebrag"]) },
      ],
    },
    {
      day: 3,
      weekday: "Wednesday",
      theme: "Turn last month's proof into a dare",
      cta: "RSVP for Saturday",
      isEventDay: false,
      slots: [
        { platform: "x", reaction: "Turns proof into a dare", contentType: "text", copy: "80 volunteers. 3 hours. 1,900 pounds of trash. That was March. April is on you.", grade: g() },
        { platform: "instagram", reaction: "The before-and-after gut-punch", contentType: "image", copy: "Same 200 yards of coast. Left: 8am. Right: 11am. That is what showing up looks like.", mediaPrompt: "split before-and-after of a littered vs clean beach cove, natural light", grade: g() },
      ],
    },
    {
      day: 4,
      weekday: "Thursday",
      theme: "A face you trust + the sponsor case",
      cta: "RSVP for Saturday",
      isEventDay: false,
      slots: [
        { platform: "instagram", reaction: "A face you trust, not a brand", contentType: "ugc_video", copy: "60 seconds with Dana, who has not missed a cleanup in four years. Ask her why.", mediaPrompt: "handheld vertical interview of a volunteer on a beach, candid, golden hour", grade: g(["cut a cliché opener"]) },
        { platform: "linkedin", reaction: "Gives a sponsor their business case", contentType: "text", copy: "Three reasons your company should sponsor a beach cleanup. The third one is recruiting, and it is the one your CFO will care about.", grade: g() },
      ],
    },
    {
      day: 5,
      weekday: "Friday",
      theme: "Remove every reason not to come",
      cta: "Tomorrow, 9am, north lot",
      isEventDay: false,
      slots: [
        { platform: "x", reaction: "Removes every reason not to come", contentType: "text", copy: "Tomorrow. 9am. Ocean Beach, north lot. Gloves and bags are on us. Just show up.", grade: g() },
      ],
    },
    {
      day: 6,
      weekday: "Saturday",
      theme: "Event day — the hero film, full volume",
      cta: "We are here. Pull up.",
      isEventDay: true,
      slots: [
        { platform: "instagram", reaction: "The hero film, full volume", contentType: "motion_video", copy: "Today is the day. Pull up.", mediaPrompt: "energetic launch-day montage of volunteers arriving at a beach, banners, sunrise", grade: g() },
        { platform: "x", reaction: "Live energy, come now", contentType: "text", copy: "Live from Ocean Beach. The crew is here, the coffee is hot, and the coast needs you. Park at the north lot.", grade: g() },
      ],
    },
    {
      day: 7,
      weekday: "Sunday",
      theme: "The payoff that earns the next ask",
      cta: "Next cleanup: second Saturday of May",
      isEventDay: false,
      slots: [
        { platform: "instagram", reaction: "The payoff that earns the next ask", contentType: "image", copy: "Yesterday, 112 of you showed up. This is what you did.", mediaPrompt: "wide shot of a clean beach and a large group of smiling volunteers holding bags", grade: g() },
        { platform: "linkedin", reaction: "Gratitude that sets up what is next", contentType: "text", copy: "112 people. 2,400 pounds. One clean coastline. Thank you. The next cleanup is the second Saturday of May, and we are already short on gloves.", grade: g() },
      ],
    },
  ],
};
