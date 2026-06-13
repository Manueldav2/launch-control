// Zernio: connect the user's social accounts and publish to them.
// One profile per workspace; accounts (X / LinkedIn / Instagram / ...) hang off
// the profile. Docs: zernio.com/api.
const BASE = process.env.ZERNIO_BASE_URL || "https://zernio.com/api";

function headers(): Record<string, string> {
  const k = process.env.ZERNIO_API_KEY;
  if (!k) throw new Error("ZERNIO_API_KEY is not set");
  return { Authorization: `Bearer ${k}`, "Content-Type": "application/json" };
}

const PLATFORM_MAP: Record<string, string> = {
  x: "twitter", linkedin: "linkedin", instagram: "instagram",
  facebook: "facebook", tiktok: "tiktok",
};

// A hosted link the user clicks to OAuth one platform into their Zernio profile.
export async function connectUrl(platform: string, profileId: string, redirectUrl: string): Promise<string> {
  const p = PLATFORM_MAP[platform] || platform;
  const url = new URL(`${BASE}/v1/connect/${p}`);
  url.searchParams.set("profileId", profileId);
  if (redirectUrl) url.searchParams.set("redirect_url", redirectUrl);
  const r = await fetch(url.toString(), { headers: headers() });
  if (!r.ok) throw new Error(`zernio connect ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.authUrl || j.url || "";
}

export async function listAccounts(profileId: string): Promise<any[]> {
  const r = await fetch(`${BASE}/v1/accounts?profileId=${encodeURIComponent(profileId)}`, { headers: headers() });
  if (!r.ok) return [];
  const j = await r.json();
  return j.accounts || j.data || (Array.isArray(j) ? j : []);
}

// Publish (or schedule) one post to one platform account.
export async function publish(opts: {
  accountId: string; platform: string; text: string; mediaUrl?: string;
  mediaType?: "image" | "video"; scheduledFor?: string;
}): Promise<any> {
  const body: Record<string, unknown> = {
    content: opts.text,
    platforms: [{ platform: PLATFORM_MAP[opts.platform] || opts.platform, accountId: opts.accountId }],
    publishNow: !opts.scheduledFor,
  };
  if (opts.scheduledFor) body.scheduledFor = opts.scheduledFor;
  if (opts.mediaUrl) body.mediaItems = [{ type: opts.mediaType || "image", url: opts.mediaUrl }];
  const r = await fetch(`${BASE}/v1/posts`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`zernio publish ${r.status}: ${await r.text()}`);
  return r.json();
}

// Comments on a published post (for the comment-watch + auto-reply).
export async function listComments(postId: string, accountId: string): Promise<any[]> {
  const r = await fetch(`${BASE}/v1/inbox/comments/${postId}?accountId=${encodeURIComponent(accountId)}`, { headers: headers() });
  if (!r.ok) return [];
  const j = await r.json();
  return j.comments || j.data || [];
}

export async function replyComment(postId: string, accountId: string, message: string, commentId?: string): Promise<any> {
  const body: Record<string, unknown> = { accountId, message };
  if (commentId) body.commentId = commentId;
  const r = await fetch(`${BASE}/v1/inbox/comments/${postId}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`zernio reply ${r.status}: ${await r.text()}`);
  return r.json();
}
