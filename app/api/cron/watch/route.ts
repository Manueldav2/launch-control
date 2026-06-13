// Comment watcher — the serverless half of comment-watching. A Vercel Cron
// (see vercel.json) hits this on a schedule, so comments get answered even with
// no browser open (the /watch page is the live, in-demo version of the same
// loop). For each connected account it scans recent published posts, finds new
// comments, drafts an in-voice reply with Claude, and — when AUTO_REPLY_COMMENTS
// is on — posts it back via Zernio. Dedup is durable: handled comment ids are
// recorded in Supabase so a reply never fires twice.
import { NextRequest, NextResponse } from "next/server";
import { resolveProfileId, connectedChannels, listPosts, listComments, replyComment } from "@/lib/zernio";
import { ask } from "@/lib/llm";
import { db } from "@/lib/store";

export const maxDuration = 300;

// Vercel sets `Authorization: Bearer $CRON_SECRET` on cron calls when the env var
// exists. If CRON_SECRET is unset we allow it (demo). A ?key= also works for a
// manual trigger.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}` || req.nextUrl.searchParams.get("key") === secret;
}

async function draftReply(postText: string, comment: string, apiKey?: string): Promise<string> {
  try {
    return (await ask({
      maxTokens: 200, apiKey,
      system:
        "You reply to comments on a nonprofit's social post, AS the nonprofit. Warm, " +
        "human, specific, brief (1-2 sentences). No em-dashes, no hype words. Thank real " +
        "interest, answer real questions, point to the CTA when natural. If spam or hostile, " +
        "reply graciously and briefly.",
      user: `POST: ${postText}\n\nCOMMENT: ${comment}\n\nYour reply:`,
    })).trim();
  } catch { return ""; }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const autoReply = process.env.AUTO_REPLY_COMMENTS === "1";
  const c = db();
  try {
    const profileId = await resolveProfileId();
    const accounts = await connectedChannels(profileId);
    let scannedPosts = 0, newComments = 0, replied = 0;
    const drafts: any[] = [];

    for (const a of accounts) {
      const posts = (await listPosts(a.accountId, "published").catch(() => [])).slice(0, 5);
      for (const p of posts) {
        const postId = String(p._id || p.id || "");
        if (!postId) continue;
        scannedPosts++;
        const comments = await listComments(postId, a.accountId).catch(() => []);
        for (const cm of comments) {
          const cid = String(cm.id || cm._id || cm.commentId || "");
          if (!cid) continue;
          // skip comments we've already handled (durable dedup)
          if (c) {
            const { data } = await c.from("handled_comments").select("comment_id").eq("comment_id", cid).maybeSingle();
            if (data) continue;
          }
          newComments++;
          const text = cm.text || cm.message || cm.content || "";
          const reply = await draftReply(p.content || p.text || "", text, undefined);
          if (!reply) continue;
          if (autoReply) {
            try {
              await replyComment(postId, a.accountId, reply, cid);
              replied++;
              if (c) await c.from("handled_comments").insert({ comment_id: cid, post_id: postId, account_id: a.accountId, reply });
            } catch { /* leave unhandled; next run retries */ }
          } else {
            drafts.push({ channel: a.channel, postId, comment: text.slice(0, 120), reply });
          }
        }
      }
    }
    return NextResponse.json({
      ok: true, autoReply, scannedPosts, newComments, replied,
      drafts: autoReply ? undefined : drafts,
      note: autoReply ? "auto-reply on" : "draft-only (set AUTO_REPLY_COMMENTS=1 to post)",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
