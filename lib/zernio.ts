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
// Zernio's platform name -> our channel key (for the UI).
export const PLATFORM_FROM: Record<string, string> = {
  twitter: "x", linkedin: "linkedin", instagram: "instagram",
  facebook: "facebook", tiktok: "tiktok",
};

export async function listProfiles(): Promise<any[]> {
  const r = await fetch(`${BASE}/v1/profiles`, { headers: headers() });
  if (!r.ok) return [];
  const j = await r.json();
  return j.profiles || j.data || (Array.isArray(j) ? j : []);
}

// The workspace's Zernio profile: the default one, else the first, else create.
// Accounts (the connected channels) hang off this. Cached per process.
let _profileId: string | undefined;
export async function resolveProfileId(name = "launch-control"): Promise<string> {
  if (_profileId) return _profileId;
  const profiles = await listProfiles();
  const pick = profiles.find((p) => p.isDefault) || profiles[0];
  if (pick?._id) { _profileId = pick._id as string; return pick._id as string; }
  // none yet — create one
  const r = await fetch(`${BASE}/v1/profiles`, {
    method: "POST", headers: headers(), body: JSON.stringify({ name }),
  });
  if (!r.ok) throw new Error(`zernio create profile ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const id: string | undefined = j.profile?._id || j._id;
  if (!id) throw new Error("zernio: profile created but no id returned");
  _profileId = id;
  return id;
}

// Connected channels for a profile, normalized to {channel, accountId, username, enabled}.
export async function connectedChannels(profileId: string): Promise<any[]> {
  const all = await listAccounts(profileId);
  return all
    .filter((a) => {
      const pid = typeof a.profileId === "object" ? a.profileId?._id : a.profileId;
      return !profileId || !pid || pid === profileId;
    })
    .map((a) => ({
      channel: PLATFORM_FROM[a.platform] || a.platform,
      accountId: a._id,
      username: a.username || a.displayName || "",
      enabled: a.enabled !== false,
    }));
}

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

// Posts for an account, optionally filtered by status ("scheduled" | "published").
// Zernio carries status + scheduledFor on each post, so this is how we surface
// the upcoming scheduled queue (and how the watcher finds recent live posts).
export async function listPosts(accountId: string, status?: string): Promise<any[]> {
  const url = new URL(`${BASE}/v1/posts`);
  url.searchParams.set("accountId", accountId);
  if (status) url.searchParams.set("status", status);
  const r = await fetch(url.toString(), { headers: headers() });
  if (!r.ok) return [];
  const j = await r.json();
  return j.posts || j.data || (Array.isArray(j) ? j : []);
}

// Cancel a scheduled (or delete a published) post. Powers "unschedule".
export async function deletePost(postId: string): Promise<boolean> {
  const r = await fetch(`${BASE}/v1/posts/${encodeURIComponent(postId)}`, { method: "DELETE", headers: headers() });
  return r.ok;
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
