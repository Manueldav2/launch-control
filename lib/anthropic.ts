// The brains. Opus 4.8 researches the site, writes the 7-day plan, and acts as
// the critic that grades its own copy before anything ships.
import Anthropic from "@anthropic-ai/sdk";
import type { WeekInputs, WeekPlan, DayPlan, ContentSlot } from "./types";
import { PLATFORMS } from "./types";
import { cacheGet, cacheSet, cacheKey } from "./cache";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

// AI-tells the critic rejects on sight. The single biggest credibility killer
// for social copy, and a great live "the model caught its own mistake" moment.
export const AI_TELLS = [
  "—", "delve", "game-changer", "game changer", "unlock the", "unleash",
  "elevate your", "supercharge", "seamless", "in today's", "it's not just",
  "isn't just", "more than just", "dive into", "let's dive", "tapestry",
  "testament to", "leverage", "revolutioniz", "thrilled to announce",
];

export function findAiTells(text: string): string[] {
  const low = (text || "").toLowerCase();
  return AI_TELLS.filter((t) => low.includes(t));
}

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

function extractJson(text: string): any {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("no JSON in model response");
  return JSON.parse(text.slice(s, e + 1));
}

export async function generateWeekPlan(inputs: WeekInputs): Promise<WeekPlan> {
  const key = cacheKey(["week", inputs, MODEL]);
  const cached = cacheGet<WeekPlan>(key);
  if (cached) return cached;

  const siteText = await fetchSiteText(inputs.website);
  const msg = await client().messages.create({
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

// The critic. Deterministic AI-tell + length checks now (fast, demoable as the
// "it caught its own mistake" moment); an LLM fact/brand check can layer on.
export function gradeSlot(slot: ContentSlot): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  const tells = findAiTells(slot.copy);
  if (tells.length) failures.push(`AI-tells: ${tells.slice(0, 3).join(", ")}`);
  if (slot.platform === "x" && (slot.copy || "").length > 280)
    failures.push(`over 280 chars (${slot.copy.length})`);
  if (!slot.copy || slot.copy.trim().length < 10) failures.push("empty/too short");
  if ((slot.contentType === "image" || slot.contentType.endsWith("video")) && !slot.mediaPrompt)
    failures.push("media slot missing a prompt");
  return { pass: failures.length === 0, failures };
}

// Rewrite one failing slot's copy (the regenerate half of the self-correct loop).
export async function fixSlotCopy(slot: ContentSlot, failures: string[]): Promise<string> {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM,
    messages: [{ role: "user", content:
      `Rewrite this ${slot.platform} post. It failed: ${failures.join("; ")}. ` +
      `Keep the same intent and CTA, fix every issue, stay under the channel limit ` +
      `(x <= 280 chars), zero AI-tells. Return ONLY the rewritten copy.\n\n${slot.copy}` }],
  });
  return msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("").trim();
}
