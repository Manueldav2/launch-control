// Shared Claude plumbing used by both the creation side (anthropic.ts) and the
// review side (critic.ts), so each can be owned and edited independently.
import Anthropic from "@anthropic-ai/sdk";
import { key as reqKey } from "./request-keys";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

// A per-request key (entered in the UI) overrides the env key. Threaded through
// every call so the app works with no .env — the user just pastes their key.
export function claude(apiKeyOverride?: string): Anthropic {
  const apiKey = apiKeyOverride || reqKey("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("No Anthropic API key — add one in the UI or set ANTHROPIC_API_KEY.");
  return new Anthropic({ apiKey });
}

// Convenience: run one prompt, get the text back.
export async function ask(opts: {
  system?: string; user: string; maxTokens?: number; apiKey?: string;
}): Promise<string> {
  const msg = await claude(opts.apiKey).messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 1024,
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: "user", content: opts.user }],
  });
  return msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
}

// Fetch one image into an Anthropic base64 image block. Returns null on any
// failure (bad status, network, decode) so OPTIONAL reference images never sink a
// vision call — a competitor CDN URL that 404s/expired is simply skipped.
async function imageBlock(url: string): Promise<any | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const media_type = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
    const data = Buffer.from(await r.arrayBuffer()).toString("base64");
    return { type: "image", source: { type: "base64", media_type: media_type as any, data } };
  } catch {
    return null;
  }
}

// Multimodal: show Opus an actual rendered image and get a verdict. Used by the
// visual critic so the review step grades the VISUALS, not just the copy.
// `refImages` (optional) are additional reference images shown AFTER the main one
// — the competitive visual critic passes the real competitor posts' images so the
// model compares ours against theirs directly. The MAIN image is required (a fetch
// failure throws, which critiqueVisual turns into a skip); reference images are
// best-effort and silently dropped if they don't load.
export async function askVision(opts: {
  imageUrl: string; refImages?: string[]; system?: string; user: string; maxTokens?: number; apiKey?: string;
}): Promise<string> {
  const main = await imageBlock(opts.imageUrl);
  if (!main) throw new Error(`image fetch failed: ${opts.imageUrl.slice(0, 60)}`);
  const refs: any[] = [];
  for (const u of (opts.refImages || []).slice(0, 3)) {
    const b = await imageBlock(u);
    if (b) refs.push(b);
  }
  const msg = await claude(opts.apiKey).messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 300,
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: "user", content: [main, ...refs, { type: "text", text: opts.user }] }],
  });
  return msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
}

export function extractJson(text: string): any {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("no JSON in model response");
  return JSON.parse(text.slice(s, e + 1));
}
