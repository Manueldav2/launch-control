"use client";

// Distribution bar (the "push the week" control). Shows the connected channels +
// the content-type routing, renders any missing media (which also enqueues each
// asset to the reviewer via /api/generate-media), then publishes or schedules the
// whole week across X / LinkedIn / Instagram / TikTok through Zernio.

import { useEffect, useState } from "react";
import { authHeader } from "@/lib/client-auth";
import { falHeader } from "@/lib/client-fal";

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

  // Render every missing media slot IN PARALLEL (UGC + stills + motion at once),
  // not one-at-a-time. Returns the plan with media filled, or null if the free
  // limit was hit. A small concurrency cap keeps fal/Vercel happy.
  // One batch call renders every missing media slot in parallel server-side and
  // returns the plan with the media filled (UGC + stills + motion at once).
  async function renderAllParallel(): Promise<Plan | null> {
    setErr(""); setResult(null);
    if (!unrendered.length) return plan;
    setRendering({ done: 0, total: unrendered.length });
    try {
      const r = await fetch("/api/render-week", {
        method: "POST", headers: { "Content-Type": "application/json", ...(keyHeader || {}), ...(await authHeader()), ...falHeader() },
        body: JSON.stringify({ plan }),
      });
      const d = await r.json();
      setRendering(null);
      if (r.status === 402) { setErr(d.error || "Free media limit reached."); if (typeof window !== "undefined") window.dispatchEvent(new Event("lc:open-fal-key")); return null; }
      if (!r.ok || !d.plan) { setErr(d.error || "media render failed"); return null; }
      onPlanChange(d.plan);
      return d.plan as Plan;
    } catch (e: any) {
      setRendering(null); setErr(String(e.message || e)); return null;
    }
  }

  async function pushWeek(mode: "now" | "schedule", planOverride?: Plan) {
    setErr(""); setPublishing(mode); setResult(null);
    try {
      const r = await fetch("/api/publish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planOverride || plan, mode }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "publish failed");
      setResult(d);
    } catch (e: any) { setErr(String(e.message || e)); }
    setPublishing(null);
  }

  // One click: render all media (parallel), then publish everything across every
  // connected platform. This is the "click OK and it all goes out" button.
  async function publishEverything(mode: "now" | "schedule") {
    const rendered = await renderAllParallel();
    if (!rendered) return; // free limit hit (own-key prompt shown)
    await pushWeek(mode, rendered);
  }
  const busy = !!rendering || !!publishing;

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
        {/* One click: render all media in parallel, then post to every channel. */}
        <button onClick={() => publishEverything("now")} disabled={busy || !anyConnected} style={btn(true, busy || !anyConnected)}>
          {rendering ? `Rendering all ${rendering.total} media...`
            : publishing === "now" ? "Publishing everywhere..."
            : `Publish everything${unrendered.length ? ` (renders ${unrendered.length} media first)` : ""}`}
        </button>
        <button onClick={() => publishEverything("schedule")} disabled={busy || !anyConnected} style={btn(false, busy || !anyConnected)}>
          {publishing === "schedule" ? "Scheduling..." : "Schedule across the week"}
        </button>
        {!anyConnected && connected !== null && (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Connect a channel above to publish.</span>
        )}
        <button onClick={() => { if (typeof window !== "undefined") window.dispatchEvent(new Event("lc:open-keys")); }}
          style={{ background: "transparent", border: 0, color: "var(--clay-deep)", fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: 0 }}>
          Use your own keys
        </button>
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
