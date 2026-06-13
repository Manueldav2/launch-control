// Research the campaign before writing a word: pull the brand off their real
// website (name, mission, voice, REAL colors, logo) and synthesize the winning
// content playbook for this CTA. The plan + media prompts consume both, so the
// week is grounded in their brand and in what actually performs.
import { ask, extractJson } from "./llm";
import type { BrandContext } from "./types";

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
