// ── REVIEW (owned by Manuel's partner) ──────────────────────────────────────
// Grade every content slot against docs/rubric.md and rewrite the ones that
// fail. This is the self-correcting half: nothing ships until it passes.
import type { ContentSlot, SlotGrade } from "./types";
import type { CompetitorPost } from "./bright-data";
import { ask, extractJson } from "./llm";

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

// PURE, offline — build the rewrite prompt. Exported + side-effect-free so the
// steer (anti-fabrication + the competitive improvements) is unit-tested with no
// API key, exactly like parseCriticVerdict. `competitiveSuggestions` (optional)
// are concrete edits the competitive critic mined from real peer posts; folding
// them in is what makes the rewrite actually out-perform the competition rather
// than merely pass the rubric.
export function buildFixPrompt(
  slot: ContentSlot,
  failures: string[],
  competitiveSuggestions?: string[],
): { system: string; user: string } {
  const fab = failures.some((f) => f.toLowerCase().includes("fabric"));
  // When fabrication is the failure, the usual cause is an invented specific
  // (a count, a stat, a quote). Steer hard: drop the specific, keep it concrete
  // but true. Telling it the exact move is what makes the rewrite converge.
  const antiFab = fab
    ? " The post invents a specific number, statistic, quote, or claim that is not " +
      "established. REMOVE every invented specific: write \"more volunteers\" not " +
      "\"eleven more\", \"a lot of trash\" not \"1,900 pounds\". Keep it concrete and " +
      "human without any unverifiable figure or quote."
    : "";
  const comp = competitiveSuggestions?.length
    ? " Also strengthen this post to OUT-PERFORM the competition in this space by " +
      "applying these concrete improvements (drawn from what wins for real peers — " +
      "never copy any competitor verbatim, never invent facts): " +
      competitiveSuggestions.slice(0, 4).join("; ") + "."
    : "";
  return {
    system:
      "You rewrite social posts to pass review. No em-dashes, no hype words, " +
      "no fabrication. Keep the intent and the CTA. Respect channel limits " +
      "(x <= 280 chars). Return ONLY the rewritten copy." + antiFab + comp,
    user: `This ${slot.platform} post failed: ${failures.join("; ")}.\n\n${slot.copy}`,
  };
}

// Rewrite one failing slot's copy (the regenerate half of the self-correct loop).
// `competitiveSuggestions` is optional and backward-compatible — passing them
// steers the rewrite to beat real peer posts, omitting them rewrites exactly as
// before.
export async function fixSlotCopy(
  slot: ContentSlot,
  failures: string[],
  apiKey?: string,
  competitiveSuggestions?: string[],
): Promise<string> {
  const { system, user } = buildFixPrompt(slot, failures, competitiveSuggestions);
  return (await ask({ maxTokens: 400, apiKey, system, user })).trim();
}

// ── COMPETITIVE COMPARISON (the Bright Data half) ────────────────────────────
// The text critic above grades each post against our internal rubric (AI-tells,
// length, CTA, fabrication). This second layer grades it against the REAL
// competition: the high-engagement peer posts Bright Data scraped for this space
// (lib/bright-data.ts → lib/research.ts). It asks Opus whether our draft holds up
// next to what actually wins and, when it doesn't, returns concrete edits that
// `fixSlotCopy` folds into a rewrite. The VISUAL critic (lib/visual-critic.ts)
// reuses this same verdict shape + parser for its own competitor comparison.
//
// Fully opt-in, exactly like the planner's competitor intel: with no peer posts
// (no Bright Data key / no competitors supplied / a scrape that returned nothing)
// every entry point below is a no-op returning a "skipped" verdict
// (comparedTo === 0, competitive: true) so the engine behaves precisely as before.
export interface CompetitiveVerdict {
  competitive: boolean;  // does our content hold up against the top peer posts?
  suggestions: string[]; // concrete edits to out-perform them (never copy verbatim)
  notes: string;         // one-line read for the maker
  comparedTo: number;    // # of peer posts benchmarked (0 = comparison was skipped)
}

// A skipped comparison: nothing to compare against, so never trigger a rewrite.
export function skippedCompetitive(): CompetitiveVerdict {
  return { competitive: true, suggestions: [], notes: "", comparedTo: 0 };
}

export const engagementOf = (p: Pick<CompetitorPost, "likes" | "comments" | "shares">): number =>
  (Number(p.likes) || 0) + (Number(p.comments) || 0) + (Number(p.shares) || 0);

// The per-post corpus label. Shows the engagement count when we actually have one;
// when a source exposes no per-post engagement (the LinkedIn activity feed always
// reports 0 — see lib/bright-data.ts), it says so honestly rather than printing a
// misleading "0 eng", which a judge model would read as "nobody engaged".
export function engagementLabel(p: Pick<CompetitorPost, "likes" | "comments" | "shares">): string {
  const e = engagementOf(p);
  return e > 0 ? `${e} eng` : "engagement n/a";
}

// Tolerant truthiness for the model's `competitive` field — a real boolean or
// "true"/"yes". Anything else (omitted, garbled, "no") reads as NOT competitive,
// which at worst triggers one extra (suggestion-guided) improvement pass.
function competitiveYes(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "string") return /^\s*(true|yes)\s*$/i.test(v);
  return false;
}

// PURE, offline verdict parser — shared by both critics. Turns the model's JSON
// reply ({competitive, suggestions, notes}) into a normalized CompetitiveVerdict
// with NO network and NO API key (unit-tested like parseCriticVerdict). A reply
// with no JSON degrades to "not competitive, no suggestions" — safe, because the
// caller only rewrites when there ARE suggestions.
export function parseCompetitiveVerdict(raw: string, comparedTo: number): CompetitiveVerdict {
  let j: any = {};
  try { j = extractJson(raw); } catch { j = {}; }
  const suggestions = Array.isArray(j.suggestions)
    ? j.suggestions
        .filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s: string) => s.trim())
        .slice(0, 4)
    : [];
  const notes = typeof j.notes === "string" ? j.notes : "";
  return { competitive: competitiveYes(j.competitive), suggestions, notes, comparedTo };
}

// PURE, offline — build the competitive-comparison prompt for one copy slot. The
// corpus is the same-platform peer posts, ranked by engagement, with their counts
// shown so the model can see what resonates. Exported so the brittle prompt shape
// is unit-tested with no API key.
export function buildCompetitiveCopyPrompt(
  slot: ContentSlot,
  cta: string,
  peers: CompetitorPost[],
): { system: string; user: string } {
  const corpus = [...peers]
    .sort((a, b) => engagementOf(b) - engagementOf(a))
    .slice(0, 6)
    .map((p) => `[${engagementLabel(p)}] ${p.text.replace(/\s+/g, " ").slice(0, 240)}`)
    .join("\n");
  return {
    system:
      "You are a competitive social-copy critic. You compare OUR draft post against " +
      "real, high-engagement competitor posts in the same space and judge whether ours " +
      "holds up. You never tell anyone to copy a competitor verbatim and you never invent " +
      "facts. Reply with ONLY JSON.",
    user:
      `Platform: ${slot.platform}. Our day's required call-to-action: "${cta}".\n\n` +
      "REAL competitor/peer posts in this space, the top performers first (engagement = " +
      "likes+comments+shares, shown where the source exposes it):\n" +
      `${corpus}\n\n` +
      `OUR DRAFT:\n${slot.copy}\n\n` +
      "Compare ours to what wins above. Return ONLY JSON:\n" +
      '{"competitive": true/false, "suggestions": ["concrete edit", "..."], "notes": "one line"}\n' +
      "competitive = false if one of these peers would clearly out-perform ours on the hook, " +
      "specificity, or the ask. suggestions = at most 4 concrete, specific changes to OUR copy " +
      "(sharper hook, concrete human detail, stronger CTA framing) that would make it beat these " +
      "peers — grounded in what wins above, never copying any post, never inventing facts. " +
      'If ours already holds up, return "competitive": true with an empty suggestions list.',
  };
}

// Compare one drafted slot to the real competitor posts for its platform. Returns
// a skipped verdict (no rewrite) when there are no same-platform peers, the copy
// is empty, or on any error — a comparison failure must never break a generation
// run. `ask` is injectable (defaults to the real LLM call) purely so the skip/
// error control flow is exercised offline, mirroring fixRender's generate/critique
// seam; production callers never pass it.
export async function compareCopyToCompetitors(
  slot: ContentSlot,
  cta: string,
  peers: CompetitorPost[],
  apiKey?: string,
  askImpl: (o: { system?: string; user: string; maxTokens?: number; apiKey?: string }) => Promise<string> = ask,
): Promise<CompetitiveVerdict> {
  const same = (peers || []).filter((p) => p.platform === slot.platform && p.text?.trim());
  if (!same.length || !slot.copy?.trim()) return skippedCompetitive();
  try {
    const { system, user } = buildCompetitiveCopyPrompt(slot, cta, same);
    const out = await askImpl({ maxTokens: 320, apiKey, system, user });
    return parseCompetitiveVerdict(out, same.length);
  } catch {
    return skippedCompetitive();
  }
}
