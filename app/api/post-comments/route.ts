// GET /api/post-comments?postId=..&accountId=..
// Read-only sibling of /api/comments (which POSTs auto-replies): lists the real
// comments on a published post so the channel UI can show the thread. New file
// in cf5de2fb's lane to keep their POST route untouched.
import { NextRequest, NextResponse } from "next/server";
import { listComments } from "@/lib/zernio";

function normalize(c: any) {
  return {
    id: String(c.id || c._id || c.commentId || ""),
    author: c.author?.username || c.author?.name || c.username || c.from?.username || c.user || "user",
    text: c.text || c.message || c.content || c.body || "",
    createdAt: c.createdAt || c.created_at || c.timestamp || null,
    avatarUrl: c.author?.avatarUrl || c.author?.profilePicture || c.avatarUrl || undefined,
  };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const postId = sp.get("postId") || "";
    const accountId = sp.get("accountId") || "";
    if (!postId || !accountId) return NextResponse.json({ comments: [] });
    const raw = await listComments(postId, accountId);
    const comments = (Array.isArray(raw) ? raw : []).map(normalize).filter((c) => c.text);
    return NextResponse.json({ comments });
  } catch (e: any) {
    return NextResponse.json({ comments: [], error: String(e?.message || e) });
  }
}
