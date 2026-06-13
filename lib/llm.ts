// Shared Claude plumbing used by both the creation side (anthropic.ts) and the
// review side (critic.ts), so each can be owned and edited independently.
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

export function claude(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

// Convenience: run one prompt, get the text back.
export async function ask(opts: {
  system?: string; user: string; maxTokens?: number;
}): Promise<string> {
  const msg = await claude().messages.create({
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
