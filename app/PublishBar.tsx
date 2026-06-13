"use client";

// Distribution bar (the "push the week" control). Shows the connected channels +
// the content-type routing, renders any missing media (which also enqueues each
// asset to the reviewer via /api/generate-media), then publishes or schedules the
// whole week across X / LinkedIn / Instagram / TikTok through Zernio.

import { useEffect, useState } from "react";

type Slot = { platform: string; contentType: string; copy: string; mediaPrompt?: string; mediaUrl?: string; reaction?: string };
type Day = { day: number; weekday: string; slots: Slot[] };
type Plan = { brand?: { name?: string; colors?: string[] }; inputs?: { location?: string }; days: Day[]; createdAt?: string };

const CHANNELS: { key: string; label: string }[] = [
  { key: "x", label: "X" }, { key: "linkedin", label: "LinkedIn" },
  { key: "instagram", label: "Instagram" }, { key: "tiktok", label: "TikTok" },
];
const LEGEND: { t: string; c: string }[] = [
  { t: "Plain text", c: "LinkedIn, X" },
  { t: "Image", c: "X, LinkedIn, Instagram" },
  { t: "UGC video", c: "Instagram, TikTok" },
  { t: "Launch film", c: "X, IG, TikTok, LinkedIn" },
];
const isMedia = (ct: string) => ct === "image" || ct === "ugc_video" || ct === "motion_video";

export default function PublishBar({ plan, onPlanChange, keyHeader }: {
  plan: Plan; onPlanChange: (p: Plan) => void; keyHeader?: Record<string, string>;
}) {
  const [connected, setConnected] = useState<string[] | null>(null);
  const [connectUrls, setConnectUrls] = useState<Record<string, string>>({});
  const [rendering, setRendering] = useState<{ done: number; total: number } | null>(null);
  const [publishing, setPublishing] = useState<"now" | "schedule" | null>(null);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/connect").then((r) => r.json()).then((d) => {
      setConnected((d.accounts || []).map((a: any) => a.channel));
      setConnectUrls(d.connect || {});
    }).catch(() => setConnected([]));
  }, []);

  const unrendered: { di: number; si: number; s: Slot; day: Day }[] = [];
  plan.days.forEach((day, di) => day.slots.forEach((s, si) => {
    if (isMedia(s.contentType) && !s.mediaUrl) unrendered.push({ di, si, s, day });
  }));

  async function renderAll() {
    setErr(""); setResult(null);
    const total = unrendered.length;
    setRendering({ done: 0, total });
    const next: Plan = structuredClone(plan);
    for (let i = 0; i < unrendered.length; i++) {
      const { di, si, s, day } = unrendered[i];
      try {
        const r = await fetch("/api/generate-media", {
          method: "POST", headers: { "Content-Type": "application/json", ...(keyHeader || {}) },
          body: JSON.stringify({
            contentType: s.contentType, prompt: s.mediaPrompt || s.copy, intent: s.reaction,
            brandColors: plan.brand?.colors, location: plan.inputs?.location,
            org: plan.brand?.name || "demo", planId: plan.createdAt || "", slot: `${day.weekday}:${s.platform}`,
            day: day.weekday, platform: s.platform, brand: plan.brand?.name, caption: (s.copy || "").slice(0, 120),
          }),
        });
        const d = await r.json();
        if (d.url) { next.days[di].slots[si].mediaUrl = d.url; onPlanChange(structuredClone(next)); }
      } catch { /* one render failing shouldn't stop the run */ }
      setRendering({ done: i + 1, total });
    }
    setRendering(null);
  }

  async function pushWeek(mode: "now" | "schedule") {
    setErr(""); setPublishing(mode); setResult(null);
    try {
      const r = await fetch("/api/publish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, mode }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "publish failed");
      setResult(d);
    } catch (e: any) { setErr(String(e.message || e)); }
    setPublishing(null);
  }

  const byChannel: Record<string, number> = {};
  if (result?.results) for (const r of result.results) if (r.ok) byChannel[r.channel] = (byChannel[r.channel] || 0) + 1;
  const anyConnected = (connected?.length || 0) > 0;

  return (
    <div className="rise" style={{ border: "1px solid var(--border-strong)", background: "var(--card)", borderRadius: 16, padding: 18, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div className="eyebrow" style={{ color: "var(--clay-deep)" }}>Distribution</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {CHANNELS.map(({ key, label }) => {
            const on = connected?.includes(key);
            const url = connectUrls[key];
            const inner = (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
                color: on ? "var(--go)" : "var(--muted)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 9px" }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: on ? "var(--go)" : "var(--border-strong)" }} />
                {label}{!on && url ? " · connect" : ""}
              </span>
            );
            return on || !url
              ? <span key={key}>{inner}</span>
              : <a key={key} href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>{inner}</a>;
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
        {LEGEND.map((l) => (
          <span key={l.t} style={{ fontSize: 11.5, color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 7, padding: "4px 8px" }}>
            <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{l.t}</strong> &rarr; {l.c}
          </span>
        ))}
      </div>

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
        {unrendered.length > 0 && (
          <button onClick={renderAll} disabled={!!rendering} style={btn(false, !!rendering)}>
            {rendering ? `Rendering ${rendering.done}/${rendering.total}...` : `Render ${unrendered.length} media`}
          </button>
        )}
        <button onClick={() => pushWeek("schedule")} disabled={!!publishing || !anyConnected} style={btn(true, !!publishing || !anyConnected)}>
          {publishing === "schedule" ? "Scheduling..." : "Schedule the week"}
        </button>
        <button onClick={() => pushWeek("now")} disabled={!!publishing || !anyConnected} style={btn(false, !!publishing || !anyConnected)}>
          {publishing === "now" ? "Publishing..." : "Publish now"}
        </button>
        {!anyConnected && connected !== null && (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Connect a channel above to publish.</span>
        )}
        {unrendered.length > 0 && (
          <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Render media first so Instagram + TikTok get the video.</span>
        )}
      </div>

      {err && <p style={{ color: "var(--abort)", fontSize: 12.5, margin: "12px 0 0" }}>{err}</p>}

      {result && (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
            {result.mode === "schedule" ? "Scheduled" : "Published"} {result.published} of {result.total} posts
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 8 }}>
            {Object.entries(byChannel).map(([ch, n]) => (
              <span key={ch} style={{ fontSize: 12, fontWeight: 600, color: "var(--clay-deep)", background: "var(--clay-bg)", borderRadius: 7, padding: "4px 9px" }}>
                {(CHANNELS.find((c) => c.key === ch)?.label || ch)}: {n}
              </span>
            ))}
          </div>
          {result.skipped?.length > 0 && (
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>
              Skipped {result.skipped.length} (Instagram/TikTok slots with no rendered media). Render media, then push again.
            </div>
          )}
          {result.results?.some((r: any) => !r.ok) && (
            <div style={{ fontSize: 11.5, color: "var(--abort)", marginTop: 6 }}>
              {result.results.filter((r: any) => !r.ok).length} failed. First: {result.results.find((r: any) => !r.ok)?.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function btn(primary: boolean, disabled: boolean): React.CSSProperties {
  return {
    background: primary ? "var(--clay)" : "transparent",
    color: primary ? "#fff" : "var(--text)",
    border: `1px solid ${primary ? "var(--clay)" : "var(--border-strong)"}`,
    borderRadius: 10, padding: "9px 16px", fontSize: 13.5, fontWeight: 600,
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1,
  };
}
