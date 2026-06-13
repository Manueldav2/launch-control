// Comment watch + auto-reply: pull comments on a published post, draft an
// in-voice reply with Claude, and (optionally) post it back via Zernio.
// Dedup: the caller passes the comment ids it has already handled (skipIds) so
// a polling watcher never re-replies to the same comment.
import { NextRequest, NextResponse } from "next/server";
import { listComments, replyComment } from "@/lib/zernio";
import { ask } from "@/lib/llm";

async function draftReply(postText: string, comment: string, voice: string, apiKey?: string): Promise<string> {
  try {
    return await ask({
      maxTokens: 200,
      apiKey,
      system:
        "You reply to comments on a nonprofit's social post, AS the nonprofit. " +
        `Warm, human, specific, brief (1-2 sentences). Voice: ${voice || "friendly and grateful"}. ` +
        "No em-dashes, no hype words. Thank real interest, answer real questions, point to the CTA " +
        "when natural. If the comment is spam or hostile, reply graciously and briefly.",
      user: `POST: ${postText}\n\nCOMMENT: ${comment}\n\nYour reply:`,
    });
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { postId, accountId, postText, voice, autoReply } = body;
    const skipIds: string[] = Array.isArray(body.skipIds) ? body.skipIds : [];
    const apiKey = req.headers.get("x-anthropic-key") || body.apiKey || undefined;
    if (!postId || !accountId)
      return NextResponse.json({ error: "postId + accountId required" }, { status: 400 });

    const comments = await listComments(postId, accountId);
    const skip = new Set(skipIds);
    const out = [];
    for (const c of comments.slice(0, 25)) {
      const id = String(c.id || c.commentId || c._id || "");
      const text = c.text || c.message || "";
      if (!text || (id && skip.has(id))) continue;
      const reply = await draftReply(postText || "", text, voice || "", apiKey);
      let posted = false;
      if (autoReply && reply) {
        try { await replyComment(postId, accountId, reply, id || undefined); posted = true; } catch { /* surface via posted=false */ }
      }
      out.push({ id, comment: text, author: c.author?.username || c.author || "someone", reply, posted });
    }
    return NextResponse.json({ replies: out, totalComments: comments.length });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
