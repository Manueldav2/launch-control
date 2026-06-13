// ── CREATION (owned by Manuel) ──────────────────────────────────────────────
// Research the brand + what wins, THEN write the 7-day plan. This is the "what
// do we post" brain. Grading/rewriting lives in critic.ts (owned by review).
import type { WeekInputs, WeekPlan, DayPlan, ContentSlot, BrandContext } from "./types";
import { PLATFORMS } from "./types";
import { claude, MODEL, extractJson } from "./llm";
import { researchBrand, winningPatterns, competitorIntel } from "./research";
import { cacheGet, cacheSet, cacheKey } from "./cache";

const SYSTEM = `You are the strategist for a small nonprofit's social launch.
You plan a 7-day content calendar that builds to a headline event (e.g. a
Saturday beach cleanup). You write copy a real person would post: specific,
warm, human. You NEVER use em-dashes, hype words (delve, game-changer, unlock,
seamless, leverage), fake statistics, or invented quotes. Every day shares ONE
call to action across all platforms. Each platform aims at a distinct reaction.
You design to what WINS — the playbook below is real performance intel; follow it.`;

function planPrompt(inputs: WeekInputs, brand: BrandContext, playbook: string, competitorIntel: string): string {
  const eventDay = inputs.eventWeekday || "Saturday";
  return `GOAL: ${inputs.goal}
OVERALL CTA: ${inputs.cta}
WEBSITE: ${inputs.website}
HEADLINE EVENT DAY: ${eventDay}

THE BRAND (researched from their real site — stay true to it, never invent facts):
- Name: ${brand.name}
- Mission: ${brand.mission || "(infer from goal, invent nothing)"}
- Voice: ${brand.voice}
- Brand colors: ${brand.colors.join(", ")}
${brand.summary ? `- Site context: ${brand.summary.slice(0, 500)}` : ""}

WINNING PLAYBOOK (what actually performs for this CTA — design to this):
${playbook || "(use proven cause-campaign instincts: specific human hooks, the demonstrable moment, one clear ask)"}
${competitorIntel ? `
REAL COMPETITOR INTEL (CTA + hook patterns mined from high-engagement peer posts — emulate these patterns, never copy any post verbatim):
${competitorIntel}` : ""}

Build a 7-day plan (Monday..Sunday). The week is a story that crescendos to the
${eventDay} event. For EACH day give: a single shared "cta" for that day, a one-line
"theme", and one slot per platform (x, linkedin, instagram). For each slot:
- "reaction": the specific feeling/action that post should provoke on that platform
- "contentType": one of text | image | ugc_video | motion_video
  (ugc_video = a person-to-camera invite; motion_video = the launch/hype beat with
   kinetic brand graphics; image = a poster/announcement; text otherwise. Use ~3
   videos across the week, the rest images/text, since video is expensive.)
- "copy": the actual post, in the brand's voice, channel-appropriate length
  (x <= 280 chars), the day's CTA woven in. Follow the winning playbook per platform.
- "mediaPrompt": for image/video slots, a concrete visual prompt. WEAVE THE BRAND
  COLORS (${brand.colors.slice(0, 3).join(", ")}) into the scene naturally (clothing,
  signage, props, on-screen text) so the media looks like THIS org.

Return ONLY JSON, no prose:
{
 "days": [
   {"day": 1, "weekday": "Monday", "cta": "", "theme": "", "isEventDay": false,
    "slots": [{"platform":"x","reaction":"","contentType":"text","copy":"","mediaPrompt":""}]}
 ]
}`;
}

export async function generateWeekPlan(inputs: WeekInputs, apiKey?: string): Promise<WeekPlan> {
  const key = cacheKey(["week", inputs, MODEL, "v3-competitors"]);
  const cached = cacheGet<WeekPlan>(key);
  if (cached) return cached;

  // Research the brand, the general playbook, and (optionally) real competitor
  // intel — all concurrently, since each feeds the plan independently. The
  // competitor pass is a no-op returning "" unless Bright Data is configured AND
  // inputs.competitors were supplied, so cost/latency stay opt-in.
  const [brand, playbook, competitors] = await Promise.all([
    researchBrand(inputs.website, apiKey),
    winningPatterns(inputs.goal, inputs.cta, apiKey),
    competitorIntel(inputs.goal, inputs.competitors || [], apiKey),
  ]);

  const msg = await claude(apiKey).messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content: planPrompt(inputs, brand, playbook, competitors) }],
  });
  const text = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
  const data = extractJson(text);

  const plan: WeekPlan = {
    inputs,
    brand,                       // the REAL researched brand (colors + logo + voice)
    playbook,
    competitorIntel: competitors, // real peer CTA intel (empty unless Bright Data + competitors set)
    days: (data.days || []).map((d: DayPlan) => ({
      ...d,
      slots: (d.slots || []).filter((s: ContentSlot) => PLATFORMS.includes(s.platform)),
    })),
    createdAt: new Date().toISOString(),
  };
  cacheSet(key, plan);
  return plan;
}
