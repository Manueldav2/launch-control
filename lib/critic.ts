// ── REVIEW (owned by Manuel's partner) ──────────────────────────────────────
// Grade every content slot against docs/rubric.md and rewrite the ones that
// fail. This is the self-correcting half: nothing ships until it passes.
import type { ContentSlot, SlotGrade } from "./types";
import { ask } from "./llm";

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

// Deterministic rubric checks (fast, ship today). Rubric: docs/rubric.md #1-4.
export function gradeSlot(slot: ContentSlot): SlotGrade {
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

// LLM rubric checks (#5-6: fabrication + CTA present). Optional layer; returns
// extra failures to merge with the deterministic ones.
export async function gradeSlotLLM(slot: ContentSlot, cta: string): Promise<string[]> {
  try {
    const out = await ask({
      maxTokens: 60,
      user:
        `A ${slot.platform} post. Day's CTA: "${cta}". ` +
        `Answer with a comma list of any that are TRUE, or "ok": ` +
        `FABRICATED (invents a stat/quote/claim), NO_CTA (the CTA is missing).\n\n${slot.copy}`,
    });
    const low = out.toLowerCase();
    const f: string[] = [];
    if (low.includes("fabricated")) f.push("possible fabrication");
    if (low.includes("no_cta")) f.push("CTA missing");
    return f;
  } catch {
    return [];
  }
}

// Rewrite one failing slot's copy (the regenerate half of the self-correct loop).
export async function fixSlotCopy(slot: ContentSlot, failures: string[]): Promise<string> {
  return (await ask({
    maxTokens: 400,
    system:
      "You rewrite social posts to pass review. No em-dashes, no hype words, " +
      "no fabrication. Keep the intent and the CTA. Respect channel limits " +
      "(x <= 280 chars). Return ONLY the rewritten copy.",
    user: `This ${slot.platform} post failed: ${failures.join("; ")}.\n\n${slot.copy}`,
  })).trim();
}
