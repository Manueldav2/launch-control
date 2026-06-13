"use client";

/**
 * Channel environments — scroll the week's final posts inside a realistic
 * skin of each platform: an X timeline, a LinkedIn feed, an Instagram profile
 * grid. Wraps the PlatformPreview frames; the chrome around them (timeline
 * header, profile header, grid) is what makes it read as "in the app".
 *
 * Self-contained: reads the WeekPlan it is handed, no app-shell coupling.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ContentSlot, DayPlan, WeekPlan, Platform } from "@/lib/types";
import { PlatformPreview } from "../previews/PlatformPreview";

// A real post published through the platform (via Zernio), as /api/posts returns it.
type RealPost = { id: string; platform: string; accountId: string; text: string; mediaUrl?: string; mediaType?: string; createdAt?: string | null; metrics?: any };
type Profile = { username?: string; displayName?: string; avatarUrl?: string | null; bio?: string | null; followers?: number | null; following?: number | null; postsCount?: number | null } | null;

// One feed item — either a real published post (carries post) or a planned/demo
// slot (carries day). Real items open the live comment thread; planned items
// open the preview card.
type Row = { slot: ContentSlot; day?: DayPlan; post?: RealPost };

const isVideo = (t: string) => t === "ugc_video" || t === "motion_video";
const abbr = (weekday: string) => weekday.slice(0, 3);

// Relative time for real posts ("3h", "2d"); weekday abbr for planned slots.
function relTime(iso?: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!t) return "";
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / 604800)}w`;
}
const rowTime = (r: Row): string => (r.post ? relTime(r.post.createdAt) || "now" : r.day ? abbr(r.day.weekday) : "");

// Map a real post into the ContentSlot shape the preview frames render from.
function postToSlot(p: RealPost): ContentSlot {
  const contentType = p.mediaType === "video" ? "ugc_video" : p.mediaUrl ? "image" : "text";
  return { platform: p.platform as ContentSlot["platform"], reaction: "", contentType: contentType as ContentSlot["contentType"], copy: p.text, mediaUrl: p.mediaUrl };
}

function handleFromName(name: string): string {
  return (name || "brand").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18) || "brand";
}
function initials(name: string): string {
  const p = (name || "").trim().split(/\s+/).filter(Boolean);
  return p.length ? (p[0][0] + (p[1]?.[0] || "")).toUpperCase() : "·";
}
function seedNum(seed: string, min: number, max: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return min + (Math.abs(h) % (max - min + 1));
}
function compact(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}
function brandColor(brand: WeekPlan["brand"] | undefined, fb = "#0e7490"): string {
  const c = brand?.colors?.find((x) => /^#?[0-9a-f]{3,8}$/i.test(x));
  return c ? (c.startsWith("#") ? c : `#${c}`) : fb;
}

const PLATFORM_LABEL: Record<string, string> = { x: "X", linkedin: "LinkedIn", instagram: "Instagram", tiktok: "TikTok" };

// ── env bar (app chrome above the simulated platform) ─────────────────────────

function EnvBar({ platform, brand, mode }: { platform: string; brand: WeekPlan["brand"]; mode?: "loading" | "live" | "empty" | "disconnected" }) {
  const pills = ["x", "linkedin", "instagram", "tiktok"];
  const modeChip = mode === "live"
    ? { dot: "var(--go)", label: "Live posts", color: "var(--go)" }
    : mode === "empty"
    ? { dot: "var(--border-strong)", label: "No posts yet", color: "var(--muted)" }
    : mode === "disconnected"
    ? { dot: "var(--border-strong)", label: "Not connected", color: "var(--muted)" }
    : { dot: "var(--border-strong)", label: "Loading…", color: "var(--muted)" };
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        background: "var(--card)",
        borderBottom: "1px solid var(--border)",
        padding: "10px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: modeChip.color, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 999, padding: "4px 10px" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: modeChip.dot }} />
        {modeChip.label}
      </span>
      <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
        <strong style={{ color: "var(--ink)" }}>{brand?.name || "your week"}</strong> on
      </span>
      <div style={{ display: "flex", gap: 5, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 999, padding: 4 }}>
        {pills.map((p) => {
          const active = p === platform;
          return (
            <Link
              key={p}
              href={`/channels/${p}`}
              style={{
                textDecoration: "none",
                background: active ? "var(--clay)" : "transparent",
                color: active ? "#fff" : "var(--text)",
                fontWeight: 600,
                fontSize: 12.5,
                padding: "5px 13px",
                borderRadius: 999,
              }}
            >
              {PLATFORM_LABEL[p]}
            </Link>
          );
        })}
      </div>
      <Link href="/calendar" style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--clay-deep)", fontWeight: 600, textDecoration: "none" }}>
        Calendar →
      </Link>
    </div>
  );
}

// ── shared modal (full post preview) ──────────────────────────────────────────

function Modal({ row, brand, onClose }: { row: Row; brand: WeekPlan["brand"]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(20,18,15,0.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", overflowY: "auto", zIndex: 60 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, color: "#fff" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{row.day ? `${row.day.weekday}${row.day.isEventDay ? " · Event day" : ""}` : "Preview"}</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <PlatformPreview slot={row.slot} brand={brand} variant="card" timeLabel={rowTime(row)} />
        </div>
      </div>
    </div>
  );
}

function EmptyFeed({ platform, dark }: { platform: string; dark?: boolean }) {
  return (
    <div style={{ padding: "60px 24px", textAlign: "center", color: dark ? "#71767b" : "var(--muted)", fontSize: 14 }}>
      No {PLATFORM_LABEL[platform]} posts to show yet.
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// X timeline
// ════════════════════════════════════════════════════════════════════════════

function XTimeline({ rows, brand, onPick, hideStats }: { rows: Row[]; brand: WeekPlan["brand"]; onPick: (r: Row) => void; hideStats?: boolean }) {
  return (
    <div style={{ background: "#000", minHeight: "calc(100vh - 42px)" }}>
      <div style={{ maxWidth: 600, margin: "0 auto", borderLeft: "1px solid #2f3336", borderRight: "1px solid #2f3336", minHeight: "100%" }}>
        <div style={{ position: "sticky", top: 42, zIndex: 20, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(12px)", borderBottom: "1px solid #2f3336" }}>
          <div style={{ padding: "12px 16px", color: "#e7e9ea", fontWeight: 800, fontSize: 19, fontFamily: '"Segoe UI",system-ui,sans-serif' }}>Home</div>
          <div style={{ display: "flex" }}>
            {["For you", "Following"].map((t, i) => (
              <div key={t} style={{ flex: 1, textAlign: "center", padding: "14px 0", color: i === 0 ? "#e7e9ea" : "#71767b", fontWeight: i === 0 ? 700 : 500, fontSize: 14.5, position: "relative", fontFamily: '"Segoe UI",system-ui,sans-serif' }}>
                {t}
                {i === 0 && <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 56, height: 4, borderRadius: 99, background: "#1d9bf0" }} />}
              </div>
            ))}
          </div>
        </div>
        {rows.length === 0 ? <EmptyFeed platform="x" dark /> : rows.map((r, i) => (
          <div key={i} onClick={() => onPick(r)} style={{ cursor: "pointer" }}>
            <PlatformPreview slot={r.slot} brand={brand} variant="feed" timeLabel={rowTime(r)} hideStats={hideStats} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LinkedIn feed
// ════════════════════════════════════════════════════════════════════════════

function LinkedInFeed({ rows, brand, onPick, profile, hideStats }: { rows: Row[]; brand: WeekPlan["brand"]; onPick: (r: Row) => void; profile?: Profile; hideStats?: boolean }) {
  const font = '-apple-system,system-ui,"Segoe UI",Roboto,sans-serif';
  const followers = profile?.followers != null ? compact(profile.followers) : null;
  return (
    <div style={{ background: "#f4f2ee", minHeight: "calc(100vh - 42px)", fontFamily: font }}>
      <div style={{ display: "flex", gap: 24, maxWidth: 1100, margin: "0 auto", padding: "24px 20px", alignItems: "flex-start" }}>
        {/* left profile card */}
        <aside style={{ flex: "0 0 225px", background: "#fff", border: "1px solid #e0dfdc", borderRadius: 10, overflow: "hidden", position: "sticky", top: 66 }}>
          <div style={{ height: 56, background: `linear-gradient(120deg, ${brandColor(brand)}, #0a66c2)` }} />
          <div style={{ padding: "0 16px 16px", marginTop: -32 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", border: "3px solid #fff", background: brandColor(brand), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 24, overflow: "hidden" }}>
              {brand?.logo ? <img src={brand.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(brand?.name || "")}
            </div>
            <div style={{ fontWeight: 600, fontSize: 16, color: "#1b1f23", marginTop: 8 }}>{brand?.name || "Your Brand"}</div>
            <div style={{ fontSize: 12, color: "#5e6064", marginTop: 3, lineHeight: 1.4 }}>{(brand?.summary || brand?.mission || "").slice(0, 80)}</div>
            <div style={{ height: 1, background: "#e0dfdc", margin: "12px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "#5e6064" }}>Followers</span>
              <span style={{ color: "#0a66c2", fontWeight: 600 }}>{followers ?? "—"}</span>
            </div>
          </div>
        </aside>

        {/* center feed */}
        <main style={{ flex: 1, maxWidth: 555, minWidth: 0 }}>
          {rows.length === 0 ? (
            <div style={{ background: "#fff", border: "1px solid #e0dfdc", borderRadius: 10 }}><EmptyFeed platform="linkedin" /></div>
          ) : rows.map((r, i) => (
            <div
              key={i}
              onClick={() => onPick(r)}
              style={{ background: "#fff", border: "1px solid #e0dfdc", borderRadius: 10, overflow: "hidden", marginBottom: 12, cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
            >
              <PlatformPreview slot={r.slot} brand={brand} variant="feed" timeLabel={rowTime(r)} hideStats={hideStats} />
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Instagram profile + grid
// ════════════════════════════════════════════════════════════════════════════

function GridTile({ row, brand, onPick, hideStats }: { row: Row; brand: WeekPlan["brand"]; onPick: (r: Row) => void; hideStats?: boolean }) {
  const { slot } = row;
  const [hover, setHover] = useState(false);
  const likes = compact(seedNum(slot.copy, 120, 8400));
  const comments = compact(seedNum(slot.copy + "c", 4, 240));

  let inner: React.ReactNode;
  if (slot.mediaUrl && !isVideo(slot.contentType)) {
    inner = <img src={slot.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />;
  } else if (slot.mediaUrl && isVideo(slot.contentType)) {
    inner = <video src={slot.mediaUrl} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />;
  } else if (slot.contentType === "text") {
    inner = (
      <div style={{ width: "100%", height: "100%", background: `linear-gradient(135deg, ${brandColor(brand, "#833ab4")}, ${brandColor({ colors: brand?.colors?.slice(1) } as WeekPlan["brand"], "#fd1d1d")})`, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <span style={{ color: "#fff", fontWeight: 600, fontSize: 14, textAlign: "center", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" }}>{slot.copy}</span>
      </div>
    );
  } else {
    inner = (
      <div style={{ width: "100%", height: "100%", background: `linear-gradient(135deg, ${brandColor(brand)}, rgba(0,0,0,0.55))`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.8" /><path d="M21 16l-5-5L7 20" /></svg>
      </div>
    );
  }

  return (
    <div
      onClick={() => onPick(row)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: "relative", aspectRatio: "1 / 1", overflow: "hidden", cursor: "pointer", background: "#fafafa" }}
    >
      {inner}
      {isVideo(slot.contentType) && (
        <span style={{ position: "absolute", top: 8, right: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
        </span>
      )}
      {hover && !hideStats && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", gap: 20, color: "#fff", fontWeight: 700, fontSize: 14 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M12 21s-7-4.5-9.3-8.3C1 9.9 2 6.5 5.2 6c1.9-.3 3.5.8 4.3 2.1l.5.8.5-.8C11.3 6.8 12.9 5.7 14.8 6 18 6.5 19 9.9 17.3 12.7 15 16.5 12 21 12 21z" /></svg>
            {likes}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M21 11.5a8.4 8.4 0 01-8.5 8.5c-1.5 0-2.9-.4-4.1-1L3 20l1.1-4.4A8.4 8.4 0 1121 11.5z" /></svg>
            {comments}
          </span>
        </div>
      )}
    </div>
  );
}

function InstagramProfile({ rows, brand, onPick, profile, hideStats }: { rows: Row[]; brand: WeekPlan["brand"]; onPick: (r: Row) => void; profile?: Profile; hideStats?: boolean }) {
  const font = '-apple-system,system-ui,"Segoe UI",Roboto,sans-serif';
  const handle = profile?.username || handleFromName(brand?.name || "");
  const followers = profile?.followers != null ? compact(profile.followers) : null;
  const following = profile?.following != null ? compact(profile.following) : null;
  return (
    <div style={{ background: "#fff", minHeight: "calc(100vh - 42px)", fontFamily: font, color: "#000" }}>
      <div style={{ maxWidth: 935, margin: "0 auto", padding: "30px 20px 0" }}>
        {/* profile header */}
        <div style={{ display: "flex", gap: 40, alignItems: "center", paddingBottom: 32, borderBottom: "1px solid #dbdbdb", flexWrap: "wrap" }}>
          <div style={{ flexShrink: 0 }}>
            <div style={{ padding: 3, borderRadius: "50%", background: "linear-gradient(45deg,#f09433,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888)" }}>
              <div style={{ padding: 3, background: "#fff", borderRadius: "50%" }}>
                <div style={{ width: 130, height: 130, borderRadius: "50%", background: brandColor(brand), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 46, overflow: "hidden" }}>
                  {brand?.logo ? <img src={brand.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(brand?.name || "")}
                </div>
              </div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <span style={{ fontSize: 20, fontWeight: 400 }}>{handle}</span>
              <button type="button" style={{ background: "#0095f6", color: "#fff", border: "none", borderRadius: 8, padding: "7px 18px", fontWeight: 600, fontSize: 14, cursor: "default" }}>Follow</button>
              <button type="button" style={{ background: "#efefef", color: "#000", border: "none", borderRadius: 8, padding: "7px 18px", fontWeight: 600, fontSize: 14, cursor: "default" }}>Message</button>
            </div>
            <div style={{ display: "flex", gap: 34, margin: "20px 0", fontSize: 15 }}>
              <span><strong>{profile?.postsCount ?? rows.length}</strong> posts</span>
              <span><strong>{followers ?? "—"}</strong> followers</span>
              <span><strong>{following ?? "—"}</strong> following</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{brand?.name || "Your Brand"}</div>
            <div style={{ fontSize: 14, color: "#262626", lineHeight: 1.4, maxWidth: 460 }}>{brand?.mission || brand?.summary || ""}</div>
          </div>
        </div>

        {/* tab */}
        <div style={{ display: "flex", justifyContent: "center", gap: 60, borderTop: "0", marginTop: -1 }}>
          <div style={{ padding: "16px 0", borderTop: "1px solid #000", fontSize: 12, fontWeight: 600, letterSpacing: 1, display: "flex", alignItems: "center", gap: 6, textTransform: "uppercase" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
            Posts
          </div>
        </div>

        {/* grid */}
        {rows.length === 0 ? <EmptyFeed platform="instagram" /> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, paddingBottom: 40 }}>
            {rows.map((r, i) => <GridTile key={i} row={r} brand={brand} onPick={onPick} hideStats={hideStats} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Comments view — real published post + its live comment thread (Zernio).
// ════════════════════════════════════════════════════════════════════════════

type Comment = { id: string; author: string; text: string; createdAt?: string | null; avatarUrl?: string };

function CommentsModal({ post, brand, onClose }: { post: RealPost; brand: WeekPlan["brand"]; onClose: () => void }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const dark = post.platform === "x";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    let alive = true;
    fetch(`/api/post-comments?postId=${encodeURIComponent(post.id)}&accountId=${encodeURIComponent(post.accountId)}`)
      .then((r) => (r.ok ? r.json() : { comments: [] }))
      .then((d) => alive && setComments(d.comments || []))
      .catch(() => alive && setComments([]));
    return () => { alive = false; window.removeEventListener("keydown", onKey); };
  }, [post.id, post.accountId, onClose]);

  const panelBg = dark ? "#15181c" : "#fff";
  const txt = dark ? "#e7e9ea" : "#1b1f23";
  const muted = dark ? "#71767b" : "#5e6064";
  const line = dark ? "#2f3336" : "#e6e6e6";

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,18,15,0.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, color: "#fff" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Published post · {relTime(post.createdAt) || "live"}</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <PlatformPreview slot={postToSlot(post)} brand={brand} variant="card" timeLabel={relTime(post.createdAt) || "now"} hideStats />
        </div>

        {/* comment thread */}
        <div style={{ marginTop: 12, background: panelBg, border: `1px solid ${line}`, borderRadius: 14, overflow: "hidden", fontFamily: '-apple-system,system-ui,"Segoe UI",Roboto,sans-serif' }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${line}`, fontSize: 13, fontWeight: 700, color: txt }}>
            Comments{comments ? ` · ${comments.length}` : ""}
          </div>
          {comments === null ? (
            <div style={{ padding: "28px 16px", textAlign: "center", color: muted, fontSize: 13 }}>Loading comments…</div>
          ) : comments.length === 0 ? (
            <div style={{ padding: "28px 16px", textAlign: "center", color: muted, fontSize: 13 }}>No comments on this post yet.</div>
          ) : (
            comments.map((c) => (
              <div key={c.id} style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${line}` }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: dark ? "#2f3336" : "#e6e6e6", color: txt, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, overflow: "hidden" }}>
                  {c.avatarUrl ? <img src={c.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (c.author[0] || "?").toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: txt }}>
                    <span style={{ fontWeight: 700 }}>{c.author}</span>
                    {c.createdAt && <span style={{ color: muted, marginLeft: 8, fontWeight: 400 }}>{relTime(c.createdAt)}</span>}
                  </div>
                  <div style={{ fontSize: 13.5, color: txt, lineHeight: 1.45, marginTop: 2, whiteSpace: "pre-wrap" }}>{c.text}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════

const PLATFORM_BG: Record<string, string> = { x: "#0f0f0f", linkedin: "#0a66c2", instagram: "#bc1888", tiktok: "#000000" };

// ════════════════════════════════════════════════════════════════════════════
// TikTok profile + video grid (native skin)
// ════════════════════════════════════════════════════════════════════════════

function TikTokTile({ row, brand, onPick }: { row: Row; brand: WeekPlan["brand"]; onPick: (r: Row) => void }) {
  const { slot } = row;
  const hasVid = isVideo(slot.contentType) && slot.mediaUrl;
  return (
    <div onClick={() => onPick(row)} style={{ position: "relative", aspectRatio: "9 / 16", overflow: "hidden", cursor: "pointer", background: "#111", borderRadius: 4 }}>
      {slot.mediaUrl ? (
        hasVid ? <video src={slot.mediaUrl} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
               : <img src={slot.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", background: `linear-gradient(160deg, ${brandColor(brand, "#25F4EE")}, #000)`, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
          <span style={{ color: "#fff", fontSize: 12, fontWeight: 600, textAlign: "center", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden", opacity: 0.92 }}>{slot.copy}</span>
        </div>
      )}
      <span style={{ position: "absolute", bottom: 6, left: 6, display: "flex", alignItems: "center", gap: 4, color: "#fff", fontSize: 11, fontWeight: 600, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
      </span>
    </div>
  );
}

function TikTokProfile({ rows, brand, onPick, profile }: { rows: Row[]; brand: WeekPlan["brand"]; onPick: (r: Row) => void; profile?: Profile }) {
  const font = '-apple-system,system-ui,"Segoe UI",Roboto,sans-serif';
  const handle = profile?.username || handleFromName(brand?.name || "");
  const followers = profile?.followers != null ? compact(profile.followers) : "—";
  const following = profile?.following != null ? compact(profile.following) : "—";
  return (
    <div style={{ background: "#fff", minHeight: "calc(100vh - 42px)", fontFamily: font, color: "#161823" }}>
      <div style={{ maxWidth: 624, margin: "0 auto", padding: "30px 20px 0" }}>
        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 116, height: 116, borderRadius: "50%", background: brandColor(brand, "#000"), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 42, overflow: "hidden", flexShrink: 0 }}>
            {brand?.logo ? <img src={brand.logo} alt="" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(brand?.name || "")}
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{handle}</div>
            <div style={{ fontSize: 16, marginTop: 2 }}>{brand?.name || ""}</div>
            <div style={{ display: "flex", gap: 22, margin: "12px 0", fontSize: 15 }}>
              <span><strong>{following}</strong> <span style={{ color: "#666" }}>Following</span></span>
              <span><strong>{followers}</strong> <span style={{ color: "#666" }}>Followers</span></span>
              <span><strong>{rows.length}</strong> <span style={{ color: "#666" }}>Posts</span></span>
            </div>
            {(brand?.mission || brand?.summary) && <div style={{ fontSize: 14, color: "#161823" }}>{brand?.mission || brand?.summary}</div>}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", borderBottom: "1px solid #e3e3e4", marginTop: 24 }}>
          <div style={{ padding: "12px 0", borderBottom: "2px solid #161823", fontSize: 14, fontWeight: 700, letterSpacing: 0.3 }}>Videos</div>
        </div>

        {rows.length === 0 ? <EmptyFeed platform="tiktok" /> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, padding: "16px 0 40px" }}>
            {rows.map((r, i) => <TikTokTile key={i} row={r} brand={brand} onPick={onPick} />)}
          </div>
        )}
      </div>
    </div>
  );
}

type Fetched = { posts: RealPost[]; profile: Profile; connected: boolean };

export function ChannelEnvironment({ platform }: { platform: Platform | "tiktok"; plan?: WeekPlan }) {
  const [picked, setPicked] = useState<Row | null>(null);
  const [data, setData] = useState<Fetched | null>(null); // null = loading

  useEffect(() => {
    let alive = true;
    setData(null);
    fetch(`/api/posts?platform=${platform}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: any) => alive && setData({ posts: Array.isArray(d.posts) ? d.posts : [], profile: d.profile || null, connected: !!d.connected }))
      .catch(() => alive && setData({ posts: [], profile: null, connected: false }));
    return () => { alive = false; };
  }, [platform]);

  // EVERYTHING below is real API data only — no demo/fabricated content.
  const profile = data?.profile || null;
  const realBrand: WeekPlan["brand"] = {
    name: profile?.displayName || profile?.username || "",
    mission: profile?.bio || "",
    voice: "",
    summary: profile?.bio || "",
    colors: [PLATFORM_BG[platform]],
    logo: profile?.avatarUrl || undefined,
  };
  const rows: Row[] = (data?.posts || []).map((p) => ({ slot: postToSlot(p), post: p }));
  const onPick = (r: Row) => setPicked(r);

  const mode = data === null ? "loading" : !data.connected ? "disconnected" : rows.length > 0 ? "live" : "empty";
  const common = { rows, brand: realBrand, onPick, profile, hideStats: true as const };

  return (
    <div>
      <EnvBar platform={platform} brand={realBrand} mode={mode} />
      {platform === "x" && <XTimeline {...common} />}
      {platform === "linkedin" && <LinkedInFeed {...common} />}
      {platform === "instagram" && <InstagramProfile {...common} />}
      {platform === "tiktok" && <TikTokProfile {...common} />}
      {picked?.post && <CommentsModal post={picked.post} brand={realBrand} onClose={() => setPicked(null)} />}
      {picked && !picked.post && <Modal row={picked} brand={realBrand} onClose={() => setPicked(null)} />}
    </div>
  );
}

export default ChannelEnvironment;
