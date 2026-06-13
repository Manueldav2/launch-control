// Comment watch + auto-reply: pull comments on a published post, draft an
// in-voice reply with Claude, and (optionally) post it back via Zernio.
import { NextRequest, NextResponse } from "next/server";
import { listComments, replyComment } from "@/lib/zernio";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

async function draftReply(postText: string, comment: string, voice: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "";
  const a = new Anthropic({ apiKey });
  const msg = await a.messages.create({
    model: MODEL, max_tokens: 200,
    system: `You reply to comments on a nonprofit's social post as the nonprofit. ` +
      `Warm, human, brief (1-2 sentences). Voice: ${voice || "friendly and grateful"}. ` +
      `No em-dashes, no hype words. If the comment is negative or spam, reply gracefully or say to skip.`,
    messages: [{ role: "user", content: `POST: ${postText}\n\nCOMMENT: ${comment}\n\nYour reply:` }],
  });
  return msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("").trim();
}

export async function POST(req: NextRequest) {
  try {
    const { postId, accountId, postText, voice, autoReply } = await req.json();
    if (!postId || !accountId) return NextResponse.json({ error: "postId + accountId required" }, { status: 400 });
    const comments = await listComments(postId, accountId);
    const out = [];
    for (const c of comments.slice(0, 20)) {
      const text = c.text || c.message || "";
      if (!text) continue;
      const reply = await draftReply(postText || "", text, voice || "");
      let posted = false;
      if (autoReply && reply) {
        try { await replyComment(postId, accountId, reply, c.id || c.commentId); posted = true; } catch {}
      }
      out.push({ comment: text, author: c.author?.username || c.author || "", reply, posted });
    }
    return NextResponse.json({ replies: out });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
