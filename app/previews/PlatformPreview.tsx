"use client";

/**
 * Platform post-previews — render a generated ContentSlot inside a realistic
 * frame for X, LinkedIn, or Instagram, so the user sees exactly how a post
 * lands "in the wild" before it ships.
 *
 * Self-contained on purpose: each frame hard-codes its own palette + font
 * stack so it reads as the real platform, not as the surrounding app theme
 * (the app shell is light/clay; X must still be black). Zero runtime deps —
 * all chrome is inline SVG, so nothing here couples to the design system.
 *
 * Feed it { slot, brand }. Optional { size, timeLabel } tune density.
 */

import { useState } from "react";
import type { ContentSlot, BrandContext, Platform } from "@/lib/types";

export type PreviewProps = {
  slot: ContentSlot;
  brand?: Partial<BrandContext>;
  /** "card" = standalone, bordered + rounded (default). "feed" = edge-to-edge
   *  timeline row (no outer border/radius, bottom divider) for channel feeds. */
  variant?: "card" | "feed";
  /** Relative timestamp shown in the header. Default "2h". */
  timeLabel?: string;
};

// ── helpers ─────────────────────────────────────────────────────────────────

const isVideo = (t: string) => t === "ugc_video" || t === "motion_video";

function handleFromName(name: string): string {
  return (name || "brand").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18) || "brand";
}

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "·";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

// Deterministic pseudo-count from a seed so the chrome looks alive but never
// flickers between renders. Same copy -> same numbers.
function seedNum(seed: string, min: number, max: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const span = max - min;
  return min + (Math.abs(h) % (span + 1));
}

function compact(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function brandColor(brand?: Partial<BrandContext>, fallback = "#1d9bf0"): string {
  const c = brand?.colors?.find((x) => /^#?[0-9a-f]{3,8}$/i.test(x));
  if (!c) return fallback;
  return c.startsWith("#") ? c : `#${c}`;
}

// ── avatar (logo or branded initial) ──────────────────────────────────────────

function Avatar({
  brand,
  size,
  ring,
}: {
  brand?: Partial<BrandContext>;
  size: number;
  ring?: boolean; // Instagram story ring
}) {
  const bg = brandColor(brand, "#6b7280");
  const inner = (
    brand?.logo ? (
      <img
        src={brand.logo}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block", background: "#fff" }}
        draggable={false}
      />
    ) : (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: bg,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: size * 0.4,
          letterSpacing: -0.3,
        }}
      >
        {initials(brand?.name || "")}
      </div>
    )
  );
  if (!ring) return inner;
  return (
    <div
      style={{
        padding: 2,
        borderRadius: "50%",
        background: "linear-gradient(45deg,#f09433,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888)",
        display: "inline-block",
      }}
    >
      <div style={{ padding: 2, borderRadius: "50%", background: "#fff", display: "inline-block" }}>{inner}</div>
    </div>
  );
}

// ── media block (image / video / branded placeholder) ─────────────────────────

function Media({
  slot,
  brand,
  radius,
  ratio,
  square,
}: {
  slot: ContentSlot;
  brand?: Partial<BrandContext>;
  radius: number;
  ratio?: string; // e.g. "1 / 1", "16 / 9"
  square?: boolean;
}) {
  const frame: React.CSSProperties = {
    width: "100%",
    aspectRatio: square ? "1 / 1" : ratio,
    borderRadius: radius,
    overflow: "hidden",
    background: "#0b0b0b",
    position: "relative",
    display: "block",
  };

  if (slot.mediaUrl) {
    return (
      <div style={frame}>
        {isVideo(slot.contentType) ? (
          <video
            src={slot.mediaUrl}
            controls
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <img
            src={slot.mediaUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            draggable={false}
          />
        )}
      </div>
    );
  }

  // No media yet — a branded "to be rendered" placeholder so the frame still
  // reads as a complete post while scrolling the week.
  const c1 = brandColor(brand, "#334155");
  return (
    <div
      style={{
        ...frame,
        background: `linear-gradient(135deg, ${c1} 0%, rgba(0,0,0,0.55) 100%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 20,
        color: "rgba(255,255,255,0.92)",
      }}
    >
      {isVideo(slot.contentType) ? (
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="11" fill="rgba(255,255,255,0.16)" />
          <path d="M10 8.5l6 3.5-6 3.5v-7z" fill="#fff" />
        </svg>
      ) : (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="3" stroke="rgba(255,255,255,0.7)" strokeWidth="1.6" />
          <circle cx="8.5" cy="8.5" r="1.8" fill="rgba(255,255,255,0.85)" />
          <path d="M21 16l-5-5L7 20" stroke="rgba(255,255,255,0.7)" strokeWidth="1.6" fill="none" />
        </svg>
      )}
      <div style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, opacity: 0.95 }}>
        {isVideo(slot.contentType) ? "Video to render" : "Image to render"}
      </div>
      {slot.mediaPrompt && (
        <div style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.45, maxWidth: 320, opacity: 0.78, fontStyle: "italic" }}>
          {slot.mediaPrompt}
        </div>
      )}
    </div>
  );
}

// ── icons (neutral, inline) ───────────────────────────────────────────────────

const VerifiedBadge = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 22 22" aria-label="Verified" style={{ flexShrink: 0 }}>
    <path
      fill={color}
      d="M20.4 11c0-1.2-.7-2.3-1.7-2.8.3-1.1 0-2.4-.9-3.3-.9-.9-2.2-1.2-3.3-.9-.5-1-1.6-1.7-2.8-1.7s-2.3.7-2.8 1.7c-1.1-.3-2.4 0-3.3.9-.9.9-1.2 2.2-.9 3.3-1 .5-1.7 1.6-1.7 2.8s.7 2.3 1.7 2.8c-.3 1.1 0 2.4.9 3.3.9.9 2.2 1.2 3.3.9.5 1 1.6 1.7 2.8 1.7s2.3-.7 2.8-1.7c1.1.3 2.4 0 3.3-.9.9-.9 1.2-2.2.9-3.3 1-.5 1.7-1.6 1.7-2.8z"
    />
    <path fill="#fff" d="M9.8 14.3l-2.7-2.7 1.1-1.1 1.6 1.6 3.9-3.9 1.1 1.1z" />
  </svg>
);

// ════════════════════════════════════════════════════════════════════════════
// X / Twitter
// ════════════════════════════════════════════════════════════════════════════

const XC = {
  bg: "#000000",
  text: "#e7e9ea",
  muted: "#71767b",
  divider: "#2f3336",
  blue: "#1d9bf0",
  like: "#f91880",
  green: "#00ba7c",
  font: '"Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif',
};

function XAction({ icon, label, color }: { icon: React.ReactNode; label?: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, color, fontSize: 13 }}>
      {icon}
      {label && <span>{label}</span>}
    </div>
  );
}

function XPreview({ slot, brand, timeLabel = "2h", variant = "card" }: PreviewProps) {
  const name = brand?.name || "Your Brand";
  const handle = handleFromName(name);
  const likes = seedNum(slot.copy, 80, 4200);
  const reposts = Math.floor(likes / 4.5);
  const replies = Math.floor(likes / 11);
  const views = likes * seedNum(slot.copy + "v", 12, 30);
  const hasMedia = slot.contentType !== "text";
  const feed = variant === "feed";

  return (
    <article
      style={{
        background: XC.bg,
        color: XC.text,
        border: feed ? "none" : `1px solid ${XC.divider}`,
        borderBottom: `1px solid ${XC.divider}`,
        borderRadius: feed ? 0 : 16,
        padding: "14px 16px",
        fontFamily: XC.font,
        maxWidth: feed ? "none" : 540,
        width: "100%",
      }}
    >
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flexShrink: 0, paddingTop: 2 }}>
          <Avatar brand={brand} size={44} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{name}</span>
            <VerifiedBadge color={XC.blue} />
            <span style={{ color: XC.muted, fontSize: 15 }}>
              @{handle} · {timeLabel}
            </span>
            <span style={{ marginLeft: "auto", color: XC.muted }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
            </span>
          </div>

          <p style={{ margin: "2px 0 0", fontSize: 15, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{slot.copy}</p>

          {hasMedia && (
            <div style={{ marginTop: 12, border: `1px solid ${XC.divider}`, borderRadius: 16, overflow: "hidden" }}>
              <Media slot={slot} brand={brand} radius={0} ratio="16 / 9" />
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, maxWidth: 425 }}>
            <XAction
              color={XC.muted}
              label={compact(replies)}
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.4 8.4 0 01-8.5 8.5c-1.5 0-2.9-.4-4.1-1L3 20l1.1-4.4A8.4 8.4 0 1121 11.5z"/></svg>}
            />
            <XAction
              color={XC.green}
              label={compact(reposts)}
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17 1l4 4-4 4-1.4-1.4L17.2 6H7v3H5V4h12.2l-1.6-1.6L17 1zM7 23l-4-4 4-4 1.4 1.4L6.8 18H17v-3h2v5H6.8l1.6 1.6L7 23z"/></svg>}
            />
            <XAction
              color={XC.like}
              label={compact(likes)}
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.5-9.3-8.3C1 9.9 2 6.5 5.2 6c1.9-.3 3.5.8 4.3 2.1l.5.8.5-.8C11.3 6.8 12.9 5.7 14.8 6 18 6.5 19 9.9 17.3 12.7 15 16.5 12 21 12 21z"/></svg>}
            />
            <XAction
              color={XC.muted}
              label={compact(views)}
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4 20V10H7V20H4zM10.5 20V4h3v16h-3zM17 20v-7h3v7h-3z"/></svg>}
            />
            <XAction
              color={XC.muted}
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 21V5a2 2 0 012-2h12a2 2 0 012 2v16l-8-4-8 4z"/></svg>}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LinkedIn
// ════════════════════════════════════════════════════════════════════════════

const LI = {
  bg: "#ffffff",
  text: "#1b1f23",
  muted: "#5e6064",
  divider: "#e6e6e6",
  blue: "#0a66c2",
  font: '-apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

function LIButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        flex: 1,
        padding: "8px 4px",
        border: "none",
        background: "transparent",
        color: LI.muted,
        fontWeight: 600,
        fontSize: 14,
        cursor: "default",
        borderRadius: 4,
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function LinkedInPreview({ slot, brand, timeLabel = "2h", variant = "card" }: PreviewProps) {
  const feed = variant === "feed";
  const name = brand?.name || "Your Brand";
  const subtitle =
    (brand?.summary && brand.summary.split(/[.\n]/)[0].trim().slice(0, 64)) ||
    brand?.voice ||
    "Nonprofit organization";
  const followers = compact(seedNum(name, 1200, 48000));
  const [open, setOpen] = useState(false);
  const long = slot.copy.length > 180;
  const body = long && !open ? slot.copy.slice(0, 180).trimEnd() : slot.copy;
  const reactions = seedNum(slot.copy, 24, 980);
  const comments = seedNum(slot.copy + "c", 3, 86);
  const hasMedia = slot.contentType !== "text";

  return (
    <article
      style={{
        background: LI.bg,
        color: LI.text,
        border: feed ? "none" : `1px solid ${LI.divider}`,
        borderRadius: feed ? 0 : 10,
        fontFamily: LI.font,
        maxWidth: feed ? "none" : 540,
        width: "100%",
        overflow: "hidden",
        boxShadow: feed ? "none" : "0 0 0 1px rgba(0,0,0,0.02), 0 2px 6px rgba(0,0,0,0.04)",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", gap: 8, padding: "12px 16px 0" }}>
        <Avatar brand={brand} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.2 }}>{name}</div>
          <div style={{ color: LI.muted, fontSize: 12, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {followers} followers
          </div>
          <div style={{ color: LI.muted, fontSize: 12, lineHeight: 1.3, display: "flex", alignItems: "center", gap: 4 }}>
            {subtitle} · {timeLabel} ·
            <svg width="13" height="13" viewBox="0 0 24 24" fill={LI.muted} aria-hidden><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm6.9 9h-3a15 15 0 00-.9-4.3A8 8 0 0118.9 11zM12 4c.8 1 1.6 2.7 1.9 5h-3.8C10.4 6.7 11.2 5 12 4zM4.3 13h3a15 15 0 00.9 4.3A8 8 0 014.3 13zm3-2h-3a8 8 0 013.9-2.3 15 15 0 00-.9 2.3zm2.8 6h3.8c-.3 2.3-1.1 4-1.9 5-.8-1-1.6-2.7-1.9-5zm5.6 0h3a8 8 0 01-3.9 2.3 15 15 0 00.9-2.3z"/></svg>
          </div>
        </div>
        <span style={{ color: LI.muted, alignSelf: "flex-start" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
        </span>
      </div>

      {/* body */}
      <div style={{ padding: "8px 16px 12px", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
        {body}
        {long && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{ border: "none", background: "transparent", color: LI.muted, cursor: "pointer", fontSize: 14, padding: 0 }}
          >
            …more
          </button>
        )}
      </div>

      {hasMedia && <Media slot={slot} brand={brand} radius={0} ratio="1.91 / 1" />}

      {/* social proof */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px 4px", fontSize: 12, color: LI.muted }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-flex" }}>
            <span style={{ width: 16, height: 16, borderRadius: "50%", background: LI.blue, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff"><path d="M2 21h4V9H2v12zM22 10c0-1.1-.9-2-2-2h-6.3l1-4.6V3a2 2 0 00-2-2L8 8v13h11l3-7v-4z"/></svg>
            </span>
          </span>
          {compact(reactions)}
        </span>
        <span>{compact(comments)} comments</span>
      </div>

      <div style={{ height: 1, background: LI.divider, margin: "0 16px" }} />

      {/* actions */}
      <div style={{ display: "flex", padding: "4px 8px" }}>
        <LIButton label="Like" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 21h3V10H2v11zM22 11a2 2 0 00-2-2h-5.5l1-4.3a1.6 1.6 0 00-3-.9L9 10v11h9.3a2 2 0 002-1.6l1.6-6.4z"/></svg>} />
        <LIButton label="Comment" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 11.5a8.4 8.4 0 01-8.5 8.5c-1.5 0-2.9-.4-4.1-1L3 20l1.1-4.4A8.4 8.4 0 1121 11.5z"/></svg>} />
        <LIButton label="Repost" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 2l4 4-4 4M21 6H8a3 3 0 00-3 3v2M7 22l-4-4 4-4M3 18h13a3 3 0 003-3v-2"/></svg>} />
        <LIButton label="Send" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>} />
      </div>
    </article>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Instagram
// ════════════════════════════════════════════════════════════════════════════

const IG = {
  bg: "#ffffff",
  text: "#000000",
  muted: "#737373",
  divider: "#dbdbdb",
  font: '-apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

function InstagramPreview({ slot, brand, timeLabel = "2h", variant = "card" }: PreviewProps) {
  const feed = variant === "feed";
  const name = brand?.name || "Your Brand";
  const handle = handleFromName(name);
  const likes = seedNum(slot.copy, 120, 8400);
  const comments = seedNum(slot.copy + "c", 4, 240);
  const textOnly = slot.contentType === "text";

  return (
    <article
      style={{
        background: IG.bg,
        color: IG.text,
        border: feed ? "none" : `1px solid ${IG.divider}`,
        borderBottom: `1px solid ${IG.divider}`,
        borderRadius: feed ? 0 : 8,
        fontFamily: IG.font,
        maxWidth: feed ? "none" : 470,
        width: "100%",
        overflow: "hidden",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
        <Avatar brand={brand} size={32} ring />
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{handle}</span>
          <VerifiedBadge color="#3897f0" />
          <span style={{ color: IG.muted, fontSize: 13 }}>· {timeLabel}</span>
        </div>
        <span style={{ color: IG.text }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
        </span>
      </div>

      {/* media hero — IG is image-first. Text-only becomes a branded quote tile. */}
      {textOnly ? (
        <div
          style={{
            aspectRatio: "1 / 1",
            background: `linear-gradient(135deg, ${brandColor(brand, "#833ab4")} 0%, ${brandColor({ colors: brand?.colors?.slice(1) }, "#fd1d1d")} 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 28,
          }}
        >
          <p style={{ color: "#fff", fontSize: 22, lineHeight: 1.35, fontWeight: 600, textAlign: "center", margin: 0, textShadow: "0 1px 12px rgba(0,0,0,0.25)" }}>
            {slot.copy}
          </p>
        </div>
      ) : (
        <Media slot={slot} brand={brand} radius={0} square />
      )}

      {/* actions */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px 4px", gap: 14 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s-7-4.5-9.3-8.3C1 9.9 2 6.5 5.2 6c1.9-.3 3.5.8 4.3 2.1l.5.8.5-.8C11.3 6.8 12.9 5.7 14.8 6 18 6.5 19 9.9 17.3 12.7 15 16.5 12 21 12 21z"/></svg>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 11.5a8.4 8.4 0 01-8.5 8.5c-1.5 0-2.9-.4-4.1-1L3 20l1.1-4.4A8.4 8.4 0 1121 11.5z"/></svg>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
        <span style={{ marginLeft: "auto" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z"/></svg>
        </span>
      </div>

      {/* likes + caption */}
      <div style={{ padding: "0 12px 12px", fontSize: 13, lineHeight: 1.45 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{compact(likes)} likes</div>
        <div>
          <span style={{ fontWeight: 600 }}>{handle}</span> <span style={{ whiteSpace: "pre-wrap" }}>{slot.copy}</span>
        </div>
        <div style={{ color: IG.muted, marginTop: 6 }}>View all {compact(comments)} comments</div>
        <div style={{ color: IG.muted, marginTop: 4, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.3 }}>{timeLabel} ago</div>
      </div>
    </article>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// dispatcher
// ════════════════════════════════════════════════════════════════════════════

const FRAMES: Record<Platform, (p: PreviewProps) => React.ReactElement> = {
  x: XPreview,
  linkedin: LinkedInPreview,
  instagram: InstagramPreview,
};

export function PlatformPreview(props: PreviewProps) {
  const Frame = FRAMES[props.slot.platform as Platform] || XPreview;
  return <Frame {...props} />;
}

export { XPreview, LinkedInPreview, InstagramPreview };
export default PlatformPreview;
