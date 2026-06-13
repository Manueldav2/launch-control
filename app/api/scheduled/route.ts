// Upcoming scheduled posts across every connected channel.
//   GET            -> { scheduled: [{platform, accountId, text, mediaUrl?, mediaType?, scheduledFor, id}] }
//   DELETE ?id=..  -> cancel one scheduled post (unschedule)
// Zernio is the scheduler: we hand it scheduledFor on publish and it fires the
// post at that time, so no background loop is needed on our side. This endpoint
// reads that queue back so the calendar can show what is going out and when.
import { NextRequest, NextResponse } from "next/server";
import { resolveProfileId, connectedChannels, listPosts, deletePost, PLATFORM_FROM } from "@/lib/zernio";

function media(p: any): { mediaUrl?: string; mediaType?: string } {
  const m = p.mediaItems?.[0] || p.media?.[0];
  const url = m?.url || p.mediaUrl || undefined;
  const type = m?.type || (url && /\.(mp4|mov|webm)/i.test(url) ? "video" : url ? "image" : undefined);
  return { mediaUrl: url, mediaType: type };
}

export async function GET() {
  try {
    const profileId = await resolveProfileId();
    const accounts = await connectedChannels(profileId);
    const lists = await Promise.all(
      accounts.map(async (a) => {
        const posts = await listPosts(a.accountId, "scheduled").catch(() => []);
        return posts.map((p: any) => ({
          id: String(p._id || p.id || ""),
          platform: a.channel || PLATFORM_FROM[p.platform] || p.platform,
          accountId: a.accountId,
          text: p.content || p.text || p.caption || "",
          scheduledFor: p.scheduledFor || p.scheduled_for || null,
          ...media(p),
        }));
      }),
    );
    const scheduled = lists.flat()
      .filter((p) => p.scheduledFor)
      .sort((a, b) => +new Date(a.scheduledFor) - +new Date(b.scheduledFor));
    return NextResponse.json({ scheduled, channels: accounts.map((a) => a.channel) });
  } catch (e: any) {
    return NextResponse.json({ scheduled: [], error: String(e?.message || e) });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const ok = await deletePost(id);
    return NextResponse.json({ ok });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
