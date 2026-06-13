"use client";

/**
 * Content calendar — the generated week laid out across its scheduled days,
 * per platform. Click any post to see exactly how it will look in the wild
 * (the platform preview). Reads the live plan from localStorage (written by
 * the home page) and falls back to a demo week so the route is never empty.
 */

import { useEffect, useState } from "react";
import type { ContentSlot, DayPlan, WeekPlan, Platform } from "@/lib/types";
import { PlatformPreview } from "../previews/PlatformPreview";
import { loadPlanLocal, DEMO_WEEK } from "./plan-store";

const PLATFORM_META: Record<Platform, { label: string; color: string; glyph: React.ReactNode }> = {
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

function PlatformDot({ platform, size = 22 }: { platform: Platform; size?: number }) {
  const m = PLATFORM_META[platform];
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
}: {
  slot: ContentSlot;
  day: DayPlan;
  brand: WeekPlan["brand"];
  onClose: () => void;
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
          <PlatformPreview slot={slot} brand={brand} />
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

export default function CalendarPage() {
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [lens, setLens] = useState<"all" | Platform>("all");
  const [picked, setPicked] = useState<{ slot: ContentSlot; day: DayPlan } | null>(null);

  useEffect(() => {
    const live = loadPlanLocal();
    if (live) setPlan(live);
  }, []);

  const showDemo = () => {
    setPlan(DEMO_WEEK);
    setIsDemo(true);
  };

  const counts = plan
    ? plan.days.flatMap((d) => d.slots).reduce((a, s) => ((a[s.platform] = (a[s.platform] || 0) + 1), a), {} as Record<string, number>)
    : {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 28px 64px" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 8 }}>
        <div>
          <div className="eyebrow" style={{ color: "var(--clay-deep)" }}>Content calendar</div>
          <h1 className="serif" style={{ fontSize: 34, color: "var(--ink)", margin: "4px 0 0", lineHeight: 1.1 }}>
            {plan ? plan.brand?.name || "Your week" : "Your week, scheduled"}
          </h1>
          {plan && (
            <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "6px 0 0" }}>
              {total} posts across {Object.keys(counts).length} platforms · {plan.days.length} days
              {isDemo && <span style={{ color: "var(--hold)", fontWeight: 600 }}> · demo week</span>}
            </p>
          )}
        </div>

        {plan && (
          <div style={{ display: "flex", gap: 6, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 999, padding: 4 }}>
            {LENS.map((l) => {
              const active = lens === l.key;
              return (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => setLens(l.key)}
                  style={{
                    border: "none",
                    background: active ? "var(--clay)" : "transparent",
                    color: active ? "#fff" : "var(--text)",
                    fontWeight: 600,
                    fontSize: 12.5,
                    padding: "6px 12px",
                    borderRadius: 999,
                    cursor: "pointer",
                  }}
                >
                  {l.label}
                  {l.key !== "all" && counts[l.key] ? ` (${counts[l.key]})` : ""}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* empty state */}
      {!plan && (
        <div
          style={{
            marginTop: 40,
            border: "1px dashed var(--border-strong)",
            borderRadius: 16,
            background: "var(--card)",
            padding: "48px 32px",
            textAlign: "center",
            maxWidth: 560,
            marginInline: "auto",
          }}
        >
          <h2 className="serif" style={{ fontSize: 22, color: "var(--ink)", margin: 0 }}>No week generated yet</h2>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.55, margin: "10px auto 22px", maxWidth: 380 }}>
            Generate a week on the home page and it will lay out here across its scheduled days. Want to see how it looks first?
          </p>
          <button
            type="button"
            onClick={showDemo}
            style={{ background: "var(--clay)", color: "#fff", border: "none", fontWeight: 600, fontSize: 14, padding: "11px 22px", borderRadius: 10, cursor: "pointer" }}
          >
            Load a demo week
          </button>
        </div>
      )}

      {/* week grid */}
      {plan && (
        <div style={{ marginTop: 22, display: "flex", gap: 14, overflowX: "auto", paddingBottom: 12 }}>
          {plan.days.map((day) => (
            <DayColumn key={day.day} day={day} lens={lens} onPick={(slot, d) => setPicked({ slot, day: d })} />
          ))}
        </div>
      )}

      {picked && plan && (
        <PreviewModal slot={picked.slot} day={picked.day} brand={plan.brand} onClose={() => setPicked(null)} />
      )}
    </div>
  );
}
