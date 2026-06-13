// ── REVIEW (owned by Manuel's partner) ──────────────────────────────────────
// Grade every content slot against docs/rubric.md and rewrite the ones that
// fail. This is the self-correcting half: nothing ships until it passes.
import type { ContentSlot, SlotGrade } from "./types";
import { ask } from "./llm";

// AI-tells the critic rejects on sight. The single biggest credibility killer
// for social copy, and a great live "the model caught its own mistake" moment.
export const AI_TELLS = [
  "—", "–", "―", "delve", "game-changer", "game changer", "unlock the", "unleash",
  "elevate your", "supercharge", "seamless", "in today's", "it's not just",
  "isn't just", "more than just", "dive into", "let's dive", "tapestry",
  "testament to", "leverage", "revolutioniz", "thrilled to announce",
];

export function findAiTells(text: string): string[] {
  const low = (text || "").toLowerCase();
  return AI_TELLS.filter((t) => low.includes(t));
}

// Deterministic rubric checks (fast, ship today). Rubric: docs/rubric.md #1-4.
export function gradeSlot(slot: ContentSlot): SlotGrade {
  const failures: string[] = [];
  const tells = findAiTells(slot.copy);
  if (tells.length) failures.push(`AI-tells: ${tells.slice(0, 3).join(", ")}`);
  if (slot.platform === "x" && (slot.copy || "").length > 280)
    failures.push(`over 280 chars (${slot.copy.length})`);
  if (!slot.copy || slot.copy.trim().length < 10) failures.push("empty/too short");
  if ((slot.contentType === "image" || slot.contentType.endsWith("video")) && !slot.mediaPrompt?.trim())
    failures.push("media slot missing a prompt");
  return { pass: failures.length === 0, failures };
}

// LLM rubric checks (#5-6: fabrication + CTA present). Optional layer; returns
// extra failures to merge with the deterministic ones.
//
// The model answers in a fixed `LABEL: yes|no` form and we parse with anchored
// regexes — NOT a substring scan. A free-form reply like "neither fabricated
// nor missing a CTA" must NOT trip the flags (a false failure here forces a
// pointless rewrite, since the route concatenates these straight into failures).
//
// `apiKey` (optional) threads a per-request UI key through to `ask`.
// `grounding` is optional and backward-compatible: pass the brand/site summary
// and the model can judge real groundedness; omit it and it only flags concrete
// invented specifics (a precise stat/quote/client it could not have known).
export async function gradeSlotLLM(
  slot: ContentSlot,
  cta: string,
  apiKey?: string,
  grounding?: string,
): Promise<string[]> {
  try {
    const ground = grounding?.trim()
      ? `\n\nGROUNDING — the only facts you may treat as true about the brand:\n${grounding.trim()}`
      : "";
    const out = await ask({
      maxTokens: 40,
      apiKey,
      system:
        "You are a strict launch-copy critic. Reply in EXACTLY this form and " +
        "nothing else:\nFABRICATED: yes|no\nNO_CTA: yes|no",
      user:
        `Post for ${slot.platform}. The day's required call-to-action is: "${cta}".${ground}\n\n` +
        `FABRICATED = the copy invents a statistic, quote, client, or claim not supported above ` +
        `(with no grounding given, only flag concrete invented specifics).\n` +
        `NO_CTA = the day's call-to-action is absent from the copy.\n\nCOPY:\n${slot.copy}`,
    });
    return parseCriticVerdict(out);
  } catch {
    return [];
  }
}

// Parse the critic model's `FABRICATED: yes|no` / `NO_CTA: yes|no` reply into
// failure strings. Exported + pure so the false-positive guard is unit-tested
// without an API key. Anchors on the label: the token right after "<label>:"
// must be yes/true, so a prose reply ("neither fabricated nor missing a CTA")
// scores clean instead of tripping every flag.
export function parseCriticVerdict(out: string): string[] {
  const low = (out || "").toLowerCase();
  const flagged = (label: string) =>
    new RegExp(`${label}\\s*:?\\s*(yes|true)\\b`).test(low);
  const f: string[] = [];
  if (flagged("fabricated")) f.push("possible fabrication");
  if (flagged("no_cta")) f.push("CTA missing");
  return f;
}

// Rewrite one failing slot's copy (the regenerate half of the self-correct loop).
export async function fixSlotCopy(slot: ContentSlot, failures: string[], apiKey?: string): Promise<string> {
  return (await ask({
    maxTokens: 400,
    apiKey,
    system:
      "You rewrite social posts to pass review. No em-dashes, no hype words, " +
      "no fabrication. Keep the intent and the CTA. Respect channel limits " +
      "(x <= 280 chars). Return ONLY the rewritten copy.",
    user: `This ${slot.platform} post failed: ${failures.join("; ")}.\n\n${slot.copy}`,
  })).trim();
}
