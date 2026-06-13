// ── CREATION (owned by Manuel) ──────────────────────────────────────────────
// Research the brand + what wins, THEN write the 7-day plan. This is the "what
// do we post" brain. Grading/rewriting lives in critic.ts (owned by review).
import type { WeekInputs, WeekPlan, DayPlan, ContentSlot, BrandContext } from "./types";
import { PLATFORMS, isEventMode } from "./types";
import { claude, MODEL, extractJson } from "./llm";
import { researchBrand, winningPatterns } from "./research";
import { assessEventWeather } from "./weather";
import { cacheGet, cacheSet, cacheKey } from "./cache";

const SYSTEM = `You are the strategist for a small nonprofit's social launch.
You plan a 7-day content calendar that builds to a headline event (e.g. a
Saturday beach cleanup). You write copy a real person would post: specific,
warm, human. You NEVER use em-dashes, hype words (delve, game-changer, unlock,
seamless, leverage), fake statistics, or invented quotes. Every day shares ONE
call to action across all platforms. Each platform aims at a distinct reaction.
You design to what WINS — the playbook below is real performance intel; follow it.`;

function planPrompt(inputs: WeekInputs, brand: BrandContext, playbook: string): string {
  const eventDay = inputs.eventWeekday || "Saturday";
  const event = isEventMode(inputs);
  const place = (inputs.location || "").trim();
  const localBlock = event
    ? `
THIS IS AN IN-PERSON EVENT in ${place}. The whole week's job is to get the LOCAL
audience to physically show up. So:
- Write to people who live near ${place}. Name the place naturally (the neighborhood,
  the landmark, the meeting spot) so it feels local, not generic.
- Give concrete reasons to come in person: who they will meet, what they will see and
  feel being there, how easy it is to get to, what to bring. Make missing it feel like
  missing something real happening in their town.
- The ${eventDay} CTA is to SHOW UP at ${place} (the website link is for details/RSVP).
- In every mediaPrompt, set the scene in a recognizable ${place} setting with real
  locals — the actual kind of place this happens (the beach, the park, the venue),
  not a generic stock backdrop. Weave the brand colors in via what people wear / signage.`
    : `
THIS CTA POINTS TO THE WEBSITE (no physical location). Keep the ask online: click,
sign up, donate, share. Do NOT invent a venue, address, or "come to" language.`;
  return `GOAL: ${inputs.goal}
OVERALL CTA: ${inputs.cta}
WEBSITE: ${inputs.website}
HEADLINE EVENT DAY: ${eventDay}
LOCATION: ${event ? place : "online / website (no physical location)"}
${localBlock}

THE BRAND (researched from their real site — stay true to it, never invent facts):
- Name: ${brand.name}
- Mission: ${brand.mission || "(infer from goal, invent nothing)"}
- Voice: ${brand.voice}
- Brand colors: ${brand.colors.join(", ")}
${brand.summary ? `- Site context: ${brand.summary.slice(0, 500)}` : ""}

WINNING PLAYBOOK (what actually performs for this CTA — design to this):
${playbook || "(use proven cause-campaign instincts: specific human hooks, the demonstrable moment, one clear ask)"}

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
  const key = cacheKey(["week", inputs, MODEL, "v3-event"]);
  const cached = cacheGet<WeekPlan>(key);
  if (cached) return cached;

  const event = isEventMode(inputs);
  // Research the brand + what wins + (for in-person events) the forecast for the
  // event day — all concurrently, since none depend on each other.
  const [brand, playbook, weather] = await Promise.all([
    researchBrand(inputs.website, apiKey),
    winningPatterns(inputs.goal, inputs.cta, apiKey),
    event ? assessEventWeather(inputs.location!, inputs.eventWeekday || "Saturday") : Promise.resolve(null),
  ]);

  const msg = await claude(apiKey).messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content: planPrompt(inputs, brand, playbook) }],
  });
  const text = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
  const data = extractJson(text);

  const plan: WeekPlan = {
    inputs,
    brand,                       // the REAL researched brand (colors + logo + voice)
    playbook,
    weather,                     // forecast + recommendation for go-to-place events
    days: (data.days || []).map((d: DayPlan) => ({
      ...d,
      slots: (d.slots || []).filter((s: ContentSlot) => PLATFORMS.includes(s.platform)),
    })),
    createdAt: new Date().toISOString(),
  };
  cacheSet(key, plan);
  return plan;
}
