// Research the campaign before writing a word: pull the brand off their real
// website (name, mission, voice, REAL colors, logo) and synthesize the winning
// content playbook for this CTA. The plan + media prompts consume both, so the
// week is grounded in their brand and in what actually performs.
import { ask, extractJson, MODEL } from "./llm";
import { PLATFORMS } from "./types";
import type { BrandContext } from "./types";
import { scrapeCompetitorPosts, brightDataEnabled, groupByPlatform, classifyPlatform, capPerAccount, type CompetitorPost } from "./bright-data";
import { cacheGet, cacheSet, cacheKey } from "./cache";

const FETCH_HEADERS = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };
const HEX = /#([0-9a-fA-F]{6})\b/g;

async function fetchText(url: string, ms = 12000): Promise<string> {
  try {
    const u = url.startsWith("http") ? url : `https://${url}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const r = await fetch(u, { headers: FETCH_HEADERS, signal: ctrl.signal, redirect: "follow" });
    clearTimeout(t);
    if (!r.ok) return "";
    return (await r.text()).slice(0, 400_000);
  } catch { return ""; }
}

// Most-used NON-neutral hex colors. Grayscale / near-white / near-black are
// chrome, not brand — filtered out. (Ported from the Paradigm brand engine.)
function brandColors(css: string, top = 5): string[] {
  const counts = new Map<string, number>();
  for (const m of css.matchAll(HEX)) {
    const h = m[1].toLowerCase();
    const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    if (Math.max(...rgb) - Math.min(...rgb) < 24) continue;       // grayscale
    const avg = rgb.reduce((a, b) => a + b, 0) / 3;
    if (avg > 235 || avg < 20) continue;                           // near white/black
    const key = "#" + h;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([c]) => c);
}

function meta(html: string, name: string): string {
  for (const attr of ["property", "name"]) {
    const m = html.match(new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]*content=["']([^"']+)`, "i"));
    if (m) return m[1].trim();
  }
  return "";
}

function findLogo(html: string, base: string): string {
  const pats = [
    /<link[^>]+rel=["']apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)/i,
    /<img[^>]+(?:class|id|alt|src)=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']+)/i,
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)/i,
  ];
  for (const p of pats) {
    const m = html.match(p);
    if (m) { try { return new URL(m[1], base).href; } catch { /* skip */ } }
  }
  return "";
}

function stripText(html: string, limit = 4000): string {
  return html
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

export async function researchBrand(website: string, apiKey?: string): Promise<BrandContext> {
  const base = website.startsWith("http") ? website : `https://${website}`;
  const html = await fetchText(base);
  let css = html;
  // pull up to 2 linked stylesheets for richer color signal
  const sheets = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)/gi)].slice(0, 2);
  for (const s of sheets) {
    try { css += await fetchText(new URL(s[1], base).href, 8000); } catch { /* skip */ }
  }
  const colors = brandColors(css);
  const logo = findLogo(html, base);
  const text = stripText(html);

  // One small pass to distill name + mission + voice in their words.
  let name = meta(html, "og:site_name") || (html.match(/<title[^>]*>([^<]+)/i)?.[1] || "").trim();
  let mission = meta(html, "og:description") || meta(html, "description");
  let voice = "";
  if (text.length > 150) {
    try {
      const out = await ask({
        maxTokens: 220,
        apiKey,
        user:
          "From this nonprofit/brand website text, return JSON: " +
          '{"name":"<org name>","mission":"<one-line what they do, their words>",' +
          '"voice":"<2 sentences: how they talk + the ONE concrete change they create>"}\n\n' +
          (mission ? `Meta description: ${mission}\n\n` : "") + `Site text:\n${text}`,
      });
      const j = extractJson(out);
      name = j.name || name;
      mission = j.mission || mission;
      voice = j.voice || "";
    } catch { /* keep regex fallbacks */ }
  }
  return {
    name: name || "the organization",
    mission: mission || "",
    voice: voice || "warm, specific, mission-driven",
    colors: colors.length ? colors : ["#1a73e8", "#34a853"],
    logo,
    summary: text.slice(0, 600),
  };
}

// What actually wins for THIS CTA, distilled into a playbook the planner uses.
// Honest synthesis from how high-performing UGC / cause campaigns work, grounded
// in the specific goal + CTA + platform norms.
export async function winningPatterns(goal: string, cta: string, apiKey?: string): Promise<string> {
  try {
    return (await ask({
      maxTokens: 700,
      apiKey,
      system:
        "You are a social strategist who has studied thousands of high-performing " +
        "UGC and nonprofit/cause campaigns. You know what makes a post stop the scroll " +
        "and drive action on X, LinkedIn, and Instagram specifically.",
      user:
        `Campaign goal: ${goal}\nCall to action: ${cta}\n\n` +
        "Give a tight WINNING PLAYBOOK for this exact campaign. Cover, in <=180 words total:\n" +
        "- The hook patterns that convert for this kind of CTA (specific, not generic)\n" +
        "- Per platform (X, LinkedIn, Instagram): the format + tone that wins and what to avoid\n" +
        "- For UGC/motion video: the shape of a clip that drives turnout (first 2 seconds, who's on camera, the ask)\n" +
        "- The single biggest mistake cause campaigns make here\n" +
        "Plain, prescriptive bullets. No fluff, no AI-tells.",
    })).trim();
  } catch { return ""; }
}

// Collect the raw, recent competitor posts across every platform, ranked by
// engagement — the real material both the PLANNER (via competitorBrief, below)
// and the CRITICS (lib/critic.ts + lib/visual-critic.ts, which compare our content
// against these) consume. This performs the single Bright Data scrape per
// generation: the returned CompetitorPost[] is reused IN MEMORY by competitorBrief
// (which takes posts directly and never scrapes) and by plan.competitorPosts, so
// there is exactly one scrape. (scrapeCompetitorPosts is also disk-cached per
// platform+competitors+limit, so re-running the same inputs doesn't re-spend.)
//
// OPTIONAL and backward-compatible: with no Bright Data token, no competitors, or
// a scrape that returns nothing, it returns [] and every consumer no-ops.
export async function collectCompetitorPosts(
  competitors: string[],
  perPlatform = 6,
  perAccount = 3,
): Promise<CompetitorPost[]> {
  if (!brightDataEnabled() || !competitors?.length) return [];
  // Route each URL to its OWN platform dataset (groupByPlatform) instead of sending
  // every URL to all three — fetch the top 15 per platform (the brief reads all of
  // them). Then cap to `perAccount` posts per competitor BEFORE taking the top
  // `perPlatform`, so one viral account can't dominate the corpus and the critics
  // benchmark against several competitors, not just the loudest.
  const grouped = groupByPlatform(competitors);
  const batches = await Promise.all(
    PLATFORMS.map((p) => scrapeCompetitorPosts(p, grouped[p], 15)),
  );
  return batches.flatMap((b) => capPerAccount(b, perAccount).slice(0, perPlatform));
}

// PURE, offline — pull the competitor profile URLs out of the discovery model's
// JSON reply, keeping only well-formed URLs that resolve to a platform we actually
// scrape (classifyPlatform) and de-duping. A reply with no JSON, or junk fields,
// yields [] — so a bad discovery pass simply means "no competitors", never a crash
// or a garbage URL fed to the scraper. Exported so the parse is unit-tested with
// no API key, like parseCompetitiveVerdict.
export function extractCompetitorUrls(raw: string, max = 12): string[] {
  let j: any;
  try { j = extractJson(raw); } catch { return []; }
  const orgs = Array.isArray(j?.competitors) ? j.competitors : [];
  const urls: string[] = [];
  for (const c of orgs) {
    for (const k of ["x", "instagram", "linkedin"]) {
      const u = c?.[k];
      if (typeof u === "string" && u.trim() && classifyPlatform(u)) urls.push(u.trim());
    }
  }
  return [...new Set(urls)].slice(0, max);
}

// Automatically RESEARCH the competition: ask Claude to name real, well-known peer
// organizations active in this campaign's space and return their public X /
// Instagram / LinkedIn profile URLs. This is what lets the competitive critics run
// with NO hand-entered competitors — the discovered profiles flow straight into
// collectCompetitorPosts → the critics.
//
// Discovery is grounded and conservative on purpose: the model is told to name
// only organizations it is confident exist and to OMIT any handle it isn't sure of
// (never guess). A wrong guess can't fabricate a FACT into our copy — the URL/author
// never enter a generation prompt, and the critics only ever see posts that actually
// came back from Bright Data. The bounded downside is benchmark QUALITY: a plausible
// wrong handle that resolves to a real-but-unrelated account adds off-target posts to
// the corpus (still capped, engagement-ranked, and distilled, so the effect is small).
// Conservative omission keeps both the benchmark on-target and spend down. Disk-cached
// per (goal, cta, website, model) so repeat runs are instant and free. Returns [] on error.
export async function discoverCompetitors(
  goal: string,
  cta: string,
  website: string,
  apiKey?: string,
): Promise<string[]> {
  if (!goal?.trim() && !website?.trim()) return [];
  const key = cacheKey(["discover-competitors", goal, cta, website, MODEL]);
  const cached = cacheGet<string[]>(key);
  if (cached) return cached;
  try {
    const out = await ask({
      maxTokens: 700,
      apiKey,
      system:
        "You identify REAL, well-known peer organizations a brand competes with for " +
        "attention on social media. Name only organizations you are confident actually " +
        "exist and are active, and give only social handles/URLs you are confident are " +
        "correct. If you are unsure of a handle, omit that field — never guess or invent one.",
      user:
        "We are planning a social campaign and want to benchmark against the competition.\n" +
        `Website: ${website}\nGoal: ${goal}\nCall to action: ${cta}\n\n` +
        `Name up to 5 real, well-known peer/competitor organizations active in THIS space ` +
        `(exclude the brand at ${website} itself). For each, give the canonical PUBLIC profile ` +
        `URL on X, Instagram, and LinkedIn that you are confident exists.\n\n` +
        "Return ONLY JSON:\n" +
        '{"competitors":[{"name":"Org","x":"https://x.com/handle",' +
        '"instagram":"https://instagram.com/handle","linkedin":"https://linkedin.com/company/slug"}]}\n' +
        "Omit any field — or the whole org — you are not confident about. Prefer prominent " +
        "organizations whose handles are well established. No prose, JSON only.",
    });
    const urls = extractCompetitorUrls(out);
    cacheSet(key, urls);
    return urls;
  } catch {
    return [];
  }
}

// Resolve the competitor posts the critics benchmark against: use hand-entered
// `competitors` when given, otherwise (when auto-discovery is on) RESEARCH them,
// then scrape. Returns both the resolved URL list (for transparency on the plan)
// and the scraped posts. A no-op returning empties when Bright Data is off, so the
// engine behaves exactly as before with no key.
export async function resolveCompetitorPosts(
  opts: { goal: string; cta: string; website: string; competitors?: string[]; autoDiscover?: boolean },
  apiKey?: string,
): Promise<{ competitors: string[]; posts: CompetitorPost[] }> {
  if (!brightDataEnabled()) return { competitors: [], posts: [] };
  const supplied = (opts.competitors || []).map((u) => (u || "").trim()).filter(Boolean);
  const competitors = supplied.length
    ? supplied
    : opts.autoDiscover === false
      ? []
      : await discoverCompetitors(opts.goal, opts.cta, opts.website, apiKey);
  const posts = await collectCompetitorPosts(competitors);
  return { competitors, posts };
}

// Distill scraped peer posts into a short brief the planner designs against. This
// is the real-data complement to winningPatterns(): where that distills general
// instincts, this grounds the advice in real competitor posts ranked by
// engagement. Takes already-fetched posts (never scrapes) so collectCompetitorPosts
// does the one scrape and the result is shared. Returns "" on no posts or any
// error — the planner then runs exactly as before.
export async function competitorBrief(
  goal: string,
  posts: CompetitorPost[],
  apiKey?: string,
): Promise<string> {
  const top = [...(posts || [])]
    .sort((a, b) => (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares))
    .slice(0, 24);
  if (!top.length) return "";

  const corpus = top
    .map((p) =>
      `[${p.platform}] ${p.likes}♥ ${p.comments}💬 ${p.shares}↗ — ` +
      p.text.replace(/\s+/g, " ").slice(0, 280))
    .join("\n");

  try {
    return (await ask({
      maxTokens: 500,
      apiKey,
      system:
        "You analyze REAL competitor social posts (with engagement counts) and " +
        "extract only what the data shows — no generic advice, no fabricated stats.",
      user:
        `Campaign goal: ${goal}\n\n` +
        "These are real, recent competitor/peer posts ranked by engagement " +
        "(♥ likes, 💬 comments, ↗ shares):\n" +
        `${corpus}\n\n` +
        "In <=150 words, extract the CTA + hook patterns the HIGHEST-engagement " +
        "posts share (call out per-platform differences), and the specific phrasings " +
        "worth emulating. Prescriptive bullets, grounded in these posts only. " +
        "Never instruct copying any post verbatim.",
    })).trim();
  } catch { return ""; }
}
