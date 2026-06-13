// Shared Claude plumbing used by both the creation side (anthropic.ts) and the
// review side (critic.ts), so each can be owned and edited independently.
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

// A per-request key (entered in the UI) overrides the env key. Threaded through
// every call so the app works with no .env — the user just pastes their key.
export function claude(apiKeyOverride?: string): Anthropic {
  const apiKey = apiKeyOverride || process.env.ANTHROPIC_API_KEY;
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

export function extractJson(text: string): any {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("no JSON in model response");
  return JSON.parse(text.slice(s, e + 1));
}
