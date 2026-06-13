"use client";

/**
 * Content calendar — the generated week laid out across its scheduled days,
 * per platform. Click any post to see exactly how it will look in the wild
 * (the platform preview). Reads the live plan from localStorage (written by
 * the home page) and falls back to a demo week so the route is never empty.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ContentSlot, DayPlan, WeekPlan, Platform } from "@/lib/types";
import { PlatformPreview } from "../previews/PlatformPreview";
import { loadPlanLocal, DEMO_WEEK } from "./plan-store";

const PLATFORM_META: Record<string, { label: string; color: string; glyph: React.ReactNode }> = {
  x: {
    label: "X",
    color: "#0f0f0f",
    glyph: <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M18.9 1.2h3.7l-8 9.1L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 1.2h7.6l5.2 6.9 6.1-6.9zm-1.3 19.4h2L6.5 3.3H4.4l13.2 17.3z"/></svg>,
  },
  linkedin: {
    label: "LinkedIn",
    color: "#0a66c2",
    glyph: <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M4.98 3.5a2.5 2.5 0 11-.02 5.001A2.5 2.5 0 014.98 3.5zM3 9h4v12H3V9zm6 0h3.8v1.7h.05c.53-1 1.83-2.05 3.76-2.05C20.5 8.65 22 10.5 22 14v7h-4v-6.2c0-1.5-.03-3.4-2.07-3.4-2.07 0-2.39 1.6-2.39 3.3V21H9V9z"/></svg>,
  },
  instagram: {
    label: "Instagram",
    color: "#e1306c",
    glyph: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#fff" stroke="none"/></svg>,
  },
  tiktok: {
    label: "TikTok",
    color: "#010101",
    glyph: <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M16.5 2c.3 2.3 1.6 3.9 3.9 4.1v2.7c-1.4.1-2.7-.3-3.9-1v6.6c0 3.6-2.6 5.9-5.7 5.6-3-.3-4.9-2.9-4.4-5.9.4-2.4 2.4-4 4.8-3.9.3 0 .6.1.9.1v2.8c-.3-.1-.6-.2-1-.2-1.2 0-2.1 1-2 2.2.1 1.1 1 1.9 2.1 1.8 1.2-.1 1.9-1 1.9-2.2V2h3.4z"/></svg>,
  },
};

const TYPE_LABEL: Record<string, string> = {
  text: "Text",
  image: "Image",
  ugc_video: "UGC video",
  motion_video: "Motion video",
};

const LENS: Array<{ key: "all" | Platform; label: string }> = [
  { key: "all", label: "All platforms" },
  { key: "x", label: "X" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "instagram", label: "Instagram" },
];

function PlatformDot({ platform, size = 22 }: { platform: Platform | string; size?: number }) {
  const m = PLATFORM_META[platform as Platform] || { label: String(platform), color: "#555", glyph: <span style={{ color: "#fff", fontSize: size * 0.42, fontWeight: 700 }}>{String(platform)[0]?.toUpperCase()}</span> };
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: m.color,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
      title={m.label}
    >
      {m.glyph}
    </span>
  );
}

function PostChip({ slot, onClick }: { slot: ContentSlot; onClick: () => void }) {
  const go = slot.grade?.pass;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 10,
        cursor: "pointer",
        marginBottom: 8,
        transition: "border-color .15s, box-shadow .15s, transform .15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--clay)";
        e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.06)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "none";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <PlatformDot platform={slot.platform} />
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>{TYPE_LABEL[slot.contentType] || slot.contentType}</span>
        <span style={{ marginLeft: "auto" }}>
          {slot.grade && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 999,
                background: go ? "var(--go-bg)" : "#f7e6e1",
                color: go ? "var(--go)" : "var(--abort)",
              }}
            >
              {go ? "Go" : "No-go"}
            </span>
          )}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "var(--clay-deep)", fontStyle: "italic", marginBottom: 4, lineHeight: 1.3 }}>
        {slot.reaction}
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: "var(--text)",
          lineHeight: 1.4,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {slot.copy}
      </div>
      {slot.contentType !== "text" && (
        <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "var(--faint)" }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: slot.mediaUrl ? "var(--go)" : "var(--hold)",
              display: "inline-block",
            }}
          />
          {slot.mediaUrl ? "Media ready" : "Media pending"}
        </div>
      )}
    </button>
  );
}

function DayColumn({
  day,
  lens,
  onPick,
}: {
  day: DayPlan;
  lens: "all" | Platform;
  onPick: (slot: ContentSlot, day: DayPlan) => void;
}) {
  const slots = day.slots.filter((s) => lens === "all" || s.platform === lens);
  return (
    <div
      style={{
        flex: "0 0 248px",
        width: 248,
        background: day.isEventDay ? "var(--clay-bg)" : "var(--bg-2)",
        border: `1px solid ${day.isEventDay ? "var(--clay)" : "var(--border)"}`,
        borderRadius: 14,
        padding: 12,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{day.weekday}</span>
          {day.isEventDay && (
            <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--clay-deep)", background: "#fff", padding: "2px 6px", borderRadius: 999, border: "1px solid var(--clay)" }}>
              Event day
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.35 }}>{day.theme}</div>
        <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 5, display: "flex", gap: 4 }}>
          <span style={{ fontWeight: 600, color: "var(--clay-deep)" }}>CTA</span>
          <span style={{ lineHeight: 1.3 }}>{day.cta}</span>
        </div>
      </div>

      <div style={{ flex: 1 }}>
        {slots.length === 0 ? (
          <div style={{ fontSize: 11.5, color: "var(--faint)", padding: "16px 4px", textAlign: "center", fontStyle: "italic" }}>
            No {lens === "all" ? "" : LENS.find((l) => l.key === lens)?.label + " "}post
          </div>
        ) : (
          slots.map((slot, i) => <PostChip key={i} slot={slot} onClick={() => onPick(slot, day)} />)
        )}
      </div>
    </div>
  );
}

function PreviewModal({
  slot,
  day,
  brand,
  onClose,
  hideStats,
}: {
  slot: ContentSlot;
  day: DayPlan;
  brand: WeekPlan["brand"];
  onClose: () => void;
  hideStats?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,18,15,0.55)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "48px 20px",
        overflowY: "auto",
        zIndex: 60,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, color: "#fff" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {day.weekday}
              {day.isEventDay ? " · Event day" : ""} · {PLATFORM_META[slot.platform as Platform]?.label}
            </div>
            <div style={{ fontSize: 11.5, opacity: 0.7 }}>{slot.reaction}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <PlatformPreview slot={slot} brand={brand} hideStats={hideStats} />
        </div>

        {slot.grade && !slot.grade.pass && slot.grade.failures.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: "#fff", background: "rgba(192,84,61,0.85)", padding: "8px 12px", borderRadius: 8 }}>
            Critic flagged: {slot.grade.failures.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

// ── real posts (published + scheduled, from Zernio via /api/posts?all=1) ──────
type RealPost = { id: string; platform: string; accountId: string; text: string; mediaUrl?: string; mediaType?: string; status?: string; scheduledFor?: string | null; date?: string | null; createdAt?: string | null };

const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 50);
function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function postSlot(p: RealPost, reaction = ""): ContentSlot {
  const contentType = (p.mediaType === "video" ? "ugc_video" : p.mediaUrl ? "image" : "text") as ContentSlot["contentType"];
  return { platform: p.platform as ContentSlot["platform"], reaction, contentType, copy: p.text, mediaUrl: p.mediaUrl };
}

// "Why" lookup: map each planned slot's copy -> its reasoning, so a published
// post can show the strategy it came from.
function buildWhy(plan: WeekPlan | null): Map<string, { reaction: string; theme: string; cta: string }> {
  const m = new Map<string, { reaction: string; theme: string; cta: string }>();
  if (!plan) return m;
  for (const d of plan.days) for (const s of d.slots) m.set(norm(s.copy), { reaction: s.reaction, theme: d.theme, cta: d.cta });
  return m;
}

function fmtTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function dayKey(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayHeader(iso?: string | null): { weekday: string; md: string } {
  const d = new Date(iso || "");
  if (isNaN(d.getTime())) return { weekday: "", md: "" };
  return { weekday: d.toLocaleDateString(undefined, { weekday: "short" }), md: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) };
}

// One post placed inside a day column (shows its time + platform icon).
function RealDayPost({ post, onPick }: { post: RealPost; onPick: () => void }) {
  const scheduled = post.status === "scheduled";
  return (
    <button
      type="button"
      onClick={onPick}
      style={{ display: "block", width: "100%", textAlign: "left", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 10, cursor: "pointer", marginBottom: 8 }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--clay)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <PlatformDot platform={post.platform} size={20} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink)" }}>{fmtTime(post.date)}</span>
        <span title={scheduled ? "Scheduled" : "Published"} style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: "50%", background: scheduled ? "var(--clay)" : "var(--go)" }} />
      </div>
      <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{post.text}</div>
    </button>
  );
}

// Real calendar — posts laid out in day columns on the day (and time) they
// went out or are scheduled for. Newest/upcoming on the right.
function RealCalendar({ posts, lens, plan, profiles, onPick }: { posts: RealPost[]; lens: "all" | Platform; plan: WeekPlan | null; profiles: Record<string, any>; onPick: (slot: ContentSlot, day: DayPlan, brand: WeekPlan["brand"]) => void }) {
  const why = buildWhy(plan);
  const shown = posts.filter((p) => lens === "all" || p.platform === lens);

  const groups: { key: string; ts: number; iso: string; posts: RealPost[] }[] = [];
  const idx = new Map<string, number>();
  for (const p of shown) {
    const k = dayKey(p.date);
    if (!k) continue;
    if (!idx.has(k)) { idx.set(k, groups.length); groups.push({ key: k, ts: new Date(p.date!).setHours(0, 0, 0, 0), iso: p.date!, posts: [] }); }
    groups[idx.get(k)!].posts.push(p);
  }
  groups.sort((a, b) => a.ts - b.ts);
  groups.forEach((g) => g.posts.sort((a, b) => +new Date(a.date || 0) - +new Date(b.date || 0)));
  const todayTs = new Date().setHours(0, 0, 0, 0);

  const pick = (p: RealPost) => {
    const w = why.get(norm(p.text));
    const prof = profiles[p.platform] || {};
    const brand: WeekPlan["brand"] = {
      name: prof.displayName || prof.username || PLATFORM_META[p.platform]?.label || p.platform,
      mission: "", voice: "", summary: prof.bio || "",
      colors: [PLATFORM_META[p.platform]?.color || "#555"],
      logo: prof.avatarUrl || undefined,
    };
    const day: DayPlan = { day: 0, weekday: fmtDate(p.date) || (p.status === "scheduled" ? "Scheduled" : "Published"), cta: w?.cta || "", theme: w?.theme || "", isEventDay: false, slots: [] };
    onPick(postSlot(p, w?.reaction || ""), day, brand);
  };

  if (groups.length === 0) return <div style={{ marginTop: 32, color: "var(--muted)", fontSize: 14 }}>No posts on {LENS.find((l) => l.key === lens)?.label} yet.</div>;

  return (
    <div style={{ marginTop: 22, display: "flex", gap: 12, overflowX: "auto", paddingBottom: 14, alignItems: "flex-start" }}>
      {groups.map((g) => {
        const h = dayHeader(g.iso);
        const isToday = g.ts === todayTs;
        const isFuture = g.ts > todayTs;
        return (
          <div key={g.key} style={{ flex: "0 0 218px", width: 218, background: isFuture ? "var(--clay-bg)" : "var(--bg-2)", border: `1px solid ${isToday || isFuture ? "var(--clay)" : "var(--border)"}`, borderRadius: 14, padding: 12 }}>
            <div style={{ marginBottom: 10, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>{h.weekday}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>{h.md}</div>
              </div>
              {(isToday || isFuture) && (
                <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--clay-deep)", background: "#fff", padding: "2px 6px", borderRadius: 999, border: "1px solid var(--clay)" }}>
                  {isToday ? "Today" : "Scheduled"}
                </span>
              )}
            </div>
            {g.posts.map((p) => <RealDayPost key={p.id} post={p} onPick={() => pick(p)} />)}
          </div>
        );
      })}
    </div>
  );
}

export default function CalendarPage() {
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [lens, setLens] = useState<"all" | Platform>("all");
  const [picked, setPicked] = useState<{ slot: ContentSlot; day: DayPlan; hideStats?: boolean; brand?: WeekPlan["brand"] } | null>(null);
  const [real, setReal] = useState<RealPost[] | null>(null); // null = loading
  const [profiles, setProfiles] = useState<Record<string, any>>({});

  useEffect(() => {
    setPlan(loadPlanLocal() || DEMO_WEEK); // always show the weekday calendar grid (saved plan, else a sample week)
    let alive = true;
    fetch("/api/posts?all=1")
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: any) => { if (!alive) return; setReal(Array.isArray(d.posts) ? d.posts : []); setProfiles(d.profiles || {}); })
      .catch(() => alive && setReal([]));
    return () => { alive = false; };
  }, []);

  const usingReal = !!real && real.length > 0;
  const realCounts = (real || []).reduce(
    (a, p) => { a.total++; if (p.status === "scheduled") a.scheduled++; else a.published++; (a.byPlat[p.platform] = (a.byPlat[p.platform] || 0) + 1); return a; },
    { total: 0, scheduled: 0, published: 0, byPlat: {} as Record<string, number> }
  );
  const planCounts = plan ? plan.days.flatMap((d) => d.slots).reduce((a, s) => ((a[s.platform] = (a[s.platform] || 0) + 1), a), {} as Record<string, number>) : {};
  const counts: Record<string, number> = usingReal ? realCounts.byPlat : planCounts;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 28px 64px" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 8 }}>
        <div>
          <div className="eyebrow" style={{ color: "var(--clay-deep)" }}>Content calendar</div>
          <h1 className="serif" style={{ fontSize: 34, color: "var(--ink)", margin: "4px 0 0", lineHeight: 1.1 }}>
            {usingReal ? "What you've posted" : plan ? plan.brand?.name || "Your week" : "Your week, scheduled"}
          </h1>
          {usingReal ? (
            <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "6px 0 0" }}>
              {realCounts.published} published · {realCounts.scheduled} scheduled, across {Object.keys(realCounts.byPlat).length} channels
            </p>
          ) : plan ? (
            <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "6px 0 0" }}>
              Planned week · not published yet. Connect a channel and publish to see it here live.
            </p>
          ) : null}
        </div>

        {(usingReal || plan) && (
          <div style={{ display: "flex", gap: 6, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 999, padding: 4 }}>
            {LENS.map((l) => {
              const active = lens === l.key;
              return (
                <button key={l.key} type="button" onClick={() => setLens(l.key)}
                  style={{ border: "none", background: active ? "var(--clay)" : "transparent", color: active ? "#fff" : "var(--text)", fontWeight: 600, fontSize: 12.5, padding: "6px 12px", borderRadius: 999, cursor: "pointer" }}>
                  {l.label}{l.key !== "all" && counts[l.key] ? ` (${counts[l.key]})` : ""}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* loading */}
      {real === null && <div style={{ marginTop: 40, color: "var(--muted)", fontSize: 14 }}>Loading your posts…</div>}

      {/* real published + scheduled */}
      {usingReal && <RealCalendar posts={real!} lens={lens} plan={plan} profiles={profiles} onPick={(slot, day, brand) => setPicked({ slot, day, hideStats: true, brand })} />}

      {/* planned week (the strategy / why) when nothing is published yet */}
      {real !== null && !usingReal && plan && (
        <>
          <div style={{ marginTop: 18, fontSize: 12.5, color: "var(--muted)" }}>Here is the plan and the reasoning behind each post. It moves to the timeline above once published.</div>
          <div style={{ marginTop: 16, display: "flex", gap: 14, overflowX: "auto", paddingBottom: 12 }}>
            {plan.days.map((day) => (
              <DayColumn key={day.day} day={day} lens={lens} onPick={(slot, d) => setPicked({ slot, day: d, hideStats: false })} />
            ))}
          </div>
        </>
      )}

      {/* nothing at all */}
      {real !== null && !usingReal && !plan && (
        <div style={{ marginTop: 40, border: "1px dashed var(--border-strong)", borderRadius: 16, background: "var(--card)", padding: "48px 32px", textAlign: "center", maxWidth: 560, marginInline: "auto" }}>
          <h2 className="serif" style={{ fontSize: 22, color: "var(--ink)", margin: 0 }}>Nothing scheduled yet</h2>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.55, margin: "10px auto 22px", maxWidth: 400 }}>
            Generate a week on the Console and publish it. Your published and scheduled posts show up here, on the days they go out.
          </p>
          <Link href="/" style={{ display: "inline-block", background: "var(--clay)", color: "#fff", fontWeight: 600, fontSize: 14, padding: "11px 22px", borderRadius: 10, textDecoration: "none" }}>
            New launch
          </Link>
        </div>
      )}

      {picked && (
        <PreviewModal slot={picked.slot} day={picked.day} brand={picked.brand || plan?.brand || ({ name: "", mission: "", voice: "", summary: "", colors: [] } as WeekPlan["brand"])} onClose={() => setPicked(null)} hideStats={picked.hideStats} />
      )}
    </div>
  );
}
