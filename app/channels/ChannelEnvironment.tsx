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

type Row = { slot: ContentSlot; day: DayPlan };

const isVideo = (t: string) => t === "ugc_video" || t === "motion_video";
const abbr = (weekday: string) => weekday.slice(0, 3);

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

const PLATFORM_LABEL: Record<Platform, string> = { x: "X", linkedin: "LinkedIn", instagram: "Instagram" };

// ── env bar (app chrome above the simulated platform) ─────────────────────────

function EnvBar({ platform, brand }: { platform: Platform; brand: WeekPlan["brand"] }) {
  const pills: Platform[] = ["x", "linkedin", "instagram"];
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
      <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
        Preview · how <strong style={{ color: "var(--ink)" }}>{brand?.name || "your week"}</strong> looks on
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
          <div style={{ fontSize: 13, fontWeight: 600 }}>{row.day.weekday}{row.day.isEventDay ? " · Event day" : ""}</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <PlatformPreview slot={row.slot} brand={brand} variant="card" timeLabel={abbr(row.day.weekday)} />
        </div>
      </div>
    </div>
  );
}

function EmptyFeed({ platform, dark }: { platform: Platform; dark?: boolean }) {
  return (
    <div style={{ padding: "60px 24px", textAlign: "center", color: dark ? "#71767b" : "var(--muted)", fontSize: 14 }}>
      No {PLATFORM_LABEL[platform]} posts in this week yet.
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// X timeline
// ════════════════════════════════════════════════════════════════════════════

function XTimeline({ rows, brand, onPick }: { rows: Row[]; brand: WeekPlan["brand"]; onPick: (r: Row) => void }) {
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
            <PlatformPreview slot={r.slot} brand={brand} variant="feed" timeLabel={abbr(r.day.weekday)} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LinkedIn feed
// ════════════════════════════════════════════════════════════════════════════

function LinkedInFeed({ rows, brand, onPick }: { rows: Row[]; brand: WeekPlan["brand"]; onPick: (r: Row) => void }) {
  const font = '-apple-system,system-ui,"Segoe UI",Roboto,sans-serif';
  const followers = compact(seedNum(brand?.name || "b", 1200, 48000));
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
              <span style={{ color: "#0a66c2", fontWeight: 600 }}>{followers}</span>
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
              <PlatformPreview slot={r.slot} brand={brand} variant="feed" timeLabel={abbr(r.day.weekday)} />
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

function GridTile({ row, brand, onPick }: { row: Row; brand: WeekPlan["brand"]; onPick: (r: Row) => void }) {
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
      {hover && (
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

function InstagramProfile({ rows, brand, onPick }: { rows: Row[]; brand: WeekPlan["brand"]; onPick: (r: Row) => void }) {
  const font = '-apple-system,system-ui,"Segoe UI",Roboto,sans-serif';
  const handle = handleFromName(brand?.name || "");
  const followers = compact(seedNum(brand?.name || "b", 1800, 92000));
  const following = compact(seedNum((brand?.name || "b") + "f", 120, 900));
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
              <span><strong>{rows.length}</strong> posts</span>
              <span><strong>{followers}</strong> followers</span>
              <span><strong>{following}</strong> following</span>
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
            {rows.map((r, i) => <GridTile key={i} row={r} brand={brand} onPick={onPick} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════

export function ChannelEnvironment({ platform, plan }: { platform: Platform; plan: WeekPlan }) {
  const [picked, setPicked] = useState<Row | null>(null);
  const rows: Row[] = plan.days.flatMap((d) => d.slots.filter((s) => s.platform === platform).map((s) => ({ slot: s, day: d })));

  return (
    <div>
      <EnvBar platform={platform} brand={plan.brand} />
      {platform === "x" && <XTimeline rows={rows} brand={plan.brand} onPick={setPicked} />}
      {platform === "linkedin" && <LinkedInFeed rows={rows} brand={plan.brand} onPick={setPicked} />}
      {platform === "instagram" && <InstagramProfile rows={rows} brand={plan.brand} onPick={setPicked} />}
      {picked && <Modal row={picked} brand={plan.brand} onClose={() => setPicked(null)} />}
    </div>
  );
}

export default ChannelEnvironment;
