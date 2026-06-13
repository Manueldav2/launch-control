// ── CREATION (owned by Manuel) ──────────────────────────────────────────────
// Research the brand + write the 7-day plan. This is the "what do we post"
// brain. The grading/rewriting lives in critic.ts (owned by review).
import type { WeekInputs, WeekPlan, DayPlan, ContentSlot } from "./types";
import { PLATFORMS } from "./types";
import { claude, MODEL, extractJson } from "./llm";
import { cacheGet, cacheSet, cacheKey } from "./cache";

async function fetchSiteText(url: string): Promise<string> {
  try {
    const u = url.startsWith("http") ? url : `https://${url}`;
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return "";
    const html = await r.text();
    return html
      .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 6000);
  } catch {
    return "";
  }
}

const SYSTEM = `You are the strategist for a small nonprofit's social launch.
You plan a 7-day content calendar that builds to a headline event (e.g. a
Saturday beach cleanup). You write copy a real person would post: specific,
warm, human. You NEVER use em-dashes, hype words (delve, game-changer, unlock,
seamless, leverage), fake statistics, or invented quotes. Every day shares ONE
call to action across all platforms. Each platform aims at a distinct reaction.`;

function planPrompt(inputs: WeekInputs, siteText: string): string {
  const eventDay = inputs.eventWeekday || "Saturday";
  return `GOAL: ${inputs.goal}
OVERALL CTA: ${inputs.cta}
WEBSITE: ${inputs.website}
HEADLINE EVENT DAY: ${eventDay}

WHAT THEIR SITE SAYS (use it to stay on-brand, never invent facts):
${siteText || "(could not read the site; rely on the goal/CTA only, invent nothing)"}

Build a 7-day plan (Monday..Sunday). The week is a story that crescendos to the
${eventDay} event. For EACH day give: a single shared "cta" for that day, a one-line
"theme", and one slot per platform (x, linkedin, instagram). For each slot:
- "reaction": the specific feeling/action that post should provoke on that platform
- "contentType": one of text | image | ugc_video | motion_video
  (use ugc_video for a person-to-camera invite, motion_video for the launch/hype
   beat, image for a poster/announcement, text otherwise; ~2-3 videos max across
   the week, the rest images/text, since video is expensive)
- "copy": the actual post, in the brand's voice, channel-appropriate length
  (x <= 280 chars), with the day's CTA woven in. No AI-tells, no fabrication.
- "mediaPrompt": for image/video slots only, a concrete visual prompt to render.

Return ONLY JSON, no prose:
{
 "brand": {"name": "", "mission": "", "voice": "", "colors": ["#hex"], "summary": ""},
 "days": [
   {"day": 1, "weekday": "Monday", "cta": "", "theme": "", "isEventDay": false,
    "slots": [{"platform":"x","reaction":"","contentType":"text","copy":"","mediaPrompt":""}]}
 ]
}`;
}

export async function generateWeekPlan(inputs: WeekInputs): Promise<WeekPlan> {
  const key = cacheKey(["week", inputs, MODEL]);
  const cached = cacheGet<WeekPlan>(key);
  if (cached) return cached;

  const siteText = await fetchSiteText(inputs.website);
  const msg = await claude().messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content: planPrompt(inputs, siteText) }],
  });
  const text = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
  const data = extractJson(text);

  const plan: WeekPlan = {
    inputs,
    brand: data.brand,
    days: (data.days || []).map((d: DayPlan) => ({
      ...d,
      slots: (d.slots || []).filter((s: ContentSlot) => PLATFORMS.includes(s.platform)),
    })),
    createdAt: new Date().toISOString(),
  };
  cacheSet(key, plan);
  return plan;
}
