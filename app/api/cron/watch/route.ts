// Comment watcher — replies to EVERY new comment under EVERY published post
// across ALL connected platforms. A Vercel Cron (see vercel.json) hits this on a
// schedule so comments get answered with no browser open; the /watch page polls
// the same endpoint for the live demo view. For each connected account it scans
// recent published posts, finds new comments, drafts an in-voice reply with
// Claude, and posts it back via Zernio when auto-reply is on. Dedup is durable:
// handled comment ids are recorded in Supabase so a reply never fires twice.
import { NextRequest, NextResponse } from "next/server";
import { resolveProfileId, connectedChannels, listPosts, listComments, replyComment } from "@/lib/zernio";
import { ask } from "@/lib/llm";
import { db } from "@/lib/store";

export const maxDuration = 300;

const POSTS_PER_ACCOUNT = parseInt(process.env.WATCH_POSTS_PER_ACCOUNT || "50", 10);

// Auto-reply when the env flag is set (the scheduled cron) OR ?reply=1 (the live
// /watch view). A ?key= or Bearer must match CRON_SECRET only if that's set.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}` || req.nextUrl.searchParams.get("key") === secret;
}

async function draftReply(postText: string, comment: string): Promise<string> {
  try {
    return (await ask({
      maxTokens: 200,
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
  const autoReply = process.env.AUTO_REPLY_COMMENTS === "1" || req.nextUrl.searchParams.get("reply") === "1";
  const c = db();
  try {
    const profileId = await resolveProfileId();
    const accounts = await connectedChannels(profileId);
    let scannedPosts = 0, newComments = 0, replied = 0;
    const replies: any[] = [];

    for (const a of accounts) {
      const posts = (await listPosts(a.accountId, "published").catch(() => [])).slice(0, POSTS_PER_ACCOUNT);
      for (const p of posts) {
        const postId = String(p._id || p.id || "");
        if (!postId) continue;
        scannedPosts++;
        const comments = await listComments(postId, a.accountId).catch(() => []);
        for (const cm of comments) {
          const cid = String(cm.id || cm._id || cm.commentId || "");
          if (!cid) continue;
          if (c) {
            const { data } = await c.from("handled_comments").select("comment_id").eq("comment_id", cid).maybeSingle();
            if (data) continue; // already replied to this one
          }
          newComments++;
          const text = cm.text || cm.message || cm.content || "";
          const author = cm.author || cm.username || cm.from?.name || cm.user?.username || "guest";
          const reply = await draftReply(p.content || p.text || "", text);
          if (!reply) continue;
          const item: any = { id: cid, channel: a.channel, postId, author, comment: String(text).slice(0, 180), reply, posted: false, at: Date.now() };
          if (autoReply) {
            try {
              await replyComment(postId, a.accountId, reply, cid);
              item.posted = true; replied++;
              if (c) await c.from("handled_comments").insert({ comment_id: cid, post_id: postId, account_id: a.accountId, reply });
            } catch (e: any) {
              const msg = String(e?.message || e);
              item.error = msg.slice(0, 200);
              // Permanent platform rejection (e.g. X's "who can reply" rule) — record
              // it so we don't redraft + retry forever. Transient errors retry next run.
              const permanent = /not allowed|forbidden|403|invalid|cannot|not be replied|unsupported|deleted/i.test(msg);
              if (permanent && c) await c.from("handled_comments").insert({ comment_id: cid, post_id: postId, account_id: a.accountId, reply: `[skipped: ${msg.slice(0, 120)}]` });
            }
          }
          replies.push(item);
        }
      }
    }
    return NextResponse.json({
      ok: true, autoReply, scannedPosts, newComments, replied, replies,
      channels: accounts.map((a) => a.channel),
      note: autoReply ? "replying to every new comment, all platforms" : "draft-only (pass ?reply=1 or set AUTO_REPLY_COMMENTS=1)",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
