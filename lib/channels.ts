// Distribution routing: which channels each kind of content belongs on, and how
// a whole WeekPlan fans out into concrete publish targets across the connected
// accounts. This is the rulebook the "push the week" action runs on.
//
// Founder's routing (content type -> channels):
//   text          -> LinkedIn, X            (the written post)
//   image         -> X, LinkedIn, Instagram (a still/poster)
//   ugc_video     -> Instagram, TikTok      (person-to-camera, native to feeds)
//   motion_video  -> X, Instagram, TikTok, LinkedIn   (the launch film, everywhere)
//
// Instagram and TikTok cannot post text-only, so a media-typed slot with no
// rendered media is skipped on those channels; X/LinkedIn still post the text.

export type Channel = "x" | "linkedin" | "instagram" | "tiktok";
export const ALL_CHANNELS: Channel[] = ["x", "linkedin", "instagram", "tiktok"];

const ROUTE: Record<string, Channel[]> = {
  text: ["linkedin", "x"],
  image: ["x", "linkedin", "instagram"],
  ugc_video: ["instagram", "tiktok"],
  motion_video: ["x", "instagram", "tiktok", "linkedin"],
};

export function channelsFor(contentType: string): Channel[] {
  return ROUTE[contentType] || ["x", "linkedin"];
}

// Channels with no text-only post type — they require an image or video.
const MEDIA_ONLY: Channel[] = ["instagram", "tiktok"];
export function requiresMedia(ch: Channel): boolean { return MEDIA_ONLY.includes(ch); }

export function isVideo(contentType: string): boolean {
  return contentType === "ugc_video" || contentType === "motion_video";
}
function mediaTypeOf(contentType: string): "image" | "video" | undefined {
  if (isVideo(contentType)) return "video";
  if (contentType === "image") return "image";
  return undefined;
}

export interface PlanDayLike {
  day: number;
  weekday: string;
  slots: { platform?: string; contentType: string; copy: string; mediaPrompt?: string; mediaUrl?: string }[];
}
export interface ConnectedLike { channel: string; accountId: string }

export interface PublishTarget {
  day: number;
  weekday: string;
  slotIndex: number;
  channel: Channel;
  accountId: string;
  contentType: string;
  text: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
}
export interface SkippedTarget { day: number; channel: Channel; contentType: string; reason: string }

// Expand a plan into concrete (slot x channel) publish targets, keeping only
// channels that are connected and that can carry this slot's content.
export function buildPublishPlan(
  days: PlanDayLike[],
  connected: ConnectedLike[],
): { targets: PublishTarget[]; skipped: SkippedTarget[] } {
  const account = new Map<string, string>();
  for (const c of connected) if (c.channel && c.accountId) account.set(c.channel, c.accountId);

  const targets: PublishTarget[] = [];
  const skipped: SkippedTarget[] = [];

  for (const d of days || []) {
    (d.slots || []).forEach((s, slotIndex) => {
      const mt = mediaTypeOf(s.contentType);
      const hasMedia = !!s.mediaUrl;
      for (const ch of channelsFor(s.contentType)) {
        const accountId = account.get(ch);
        if (!accountId) continue; // not connected — silently out of scope
        if (requiresMedia(ch) && !hasMedia) {
          skipped.push({ day: d.day, channel: ch, contentType: s.contentType, reason: "media not rendered yet" });
          continue;
        }
        targets.push({
          day: d.day, weekday: d.weekday, slotIndex, channel: ch, accountId,
          contentType: s.contentType, text: s.copy,
          mediaUrl: hasMedia ? s.mediaUrl : undefined,
          mediaType: hasMedia ? mt : undefined,
        });
      }
    });
  }
  return { targets, skipped };
}

// When scheduling the week, day N posts on (base + N-1) days; multiple posts the
// same day are staggered so a channel never bursts. Returns an ISO string.
export function scheduleAt(day: number, indexWithinRun: number, base = new Date()): string {
  const d = new Date(base);
  d.setHours(10, 0, 0, 0);
  d.setDate(d.getDate() + Math.max(0, day - 1));
  d.setMinutes(d.getMinutes() + (indexWithinRun % 6) * 41); // spread same-day posts
  return d.toISOString();
}
