"use client";

// Event-mode Gen UI: the weather decision card, the created-Luma-event card, and
// the Luma connect modal. These appear only for "go somewhere" launches. Clay
// aesthetic, neutral weather glyphs (no emoji/stars), real data only.

import { useState } from "react";

export type WeatherWatch = {
  location: string; eventDate: string; weekday: string; condition: string;
  precipProb: number; tempMaxC: number; windMaxKmh: number; isBad: boolean;
  severe: boolean; summary: string;
  recommendation: "reschedule" | "rain_plan" | "proceed";
  rainPlanNote?: string;
  altDay?: { weekday: string; date: string; condition: string; precipProb: number };
};
export type LumaEvent = { id: string; url: string; name: string; startAt: string; timezone: string; description: string };

const f = (c: number) => Math.round((c * 9) / 5 + 32);

// A cloud-with-rain glyph for wet days, a sun for clear ones. Pure SVG.
function WeatherGlyph({ wet, size = 22 }: { wet: boolean; size?: number }) {
  return wet ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
      <path d="M7 17a4 4 0 010-8 5 5 0 019.6-1.3A3.5 3.5 0 0117 17H7z" />
      <path d="M8 20l-1 2M12 20l-1 2M16 20l-1 2" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
    </svg>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 1, padding: "5px 11px", border: "1px solid var(--border)", borderRadius: 9, background: "var(--card)" }}>
      <span style={{ fontSize: 10, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{value}</span>
    </span>
  );
}

export function WeatherWatchCard({ weather, resolution, busy, onReschedule, onRainPlan, onProceed }: {
  weather: WeatherWatch;
  resolution: { action: string; note: string } | null;
  busy: boolean;
  onReschedule: () => void;
  onRainPlan: () => void;
  onProceed: () => void;
}) {
  const rec = weather.altDay ? weather.recommendation : (weather.recommendation === "reschedule" ? "rain_plan" : weather.recommendation);

  if (resolution) {
    return (
      <div className="rise" style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 14, padding: "13px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ color: "var(--clay-deep)", display: "flex" }}><WeatherGlyph wet={weather.isBad} size={18} /></span>
        <span style={{ fontSize: 13.5, color: "var(--ink)" }}>{resolution.note}</span>
      </div>
    );
  }

  const Opt = ({ id, title, detail, onClick, primary }: { id: string; title: string; detail?: string; onClick: () => void; primary: boolean }) => (
    <button type="button" onClick={onClick} disabled={busy} style={{
      flex: 1, minWidth: 150, textAlign: "left", cursor: busy ? "wait" : "pointer",
      background: primary ? "var(--clay)" : "transparent",
      color: primary ? "#fff" : "var(--text)",
      border: `1px solid ${primary ? "var(--clay)" : "var(--border-strong)"}`,
      borderRadius: 11, padding: "11px 13px", opacity: busy ? 0.6 : 1, transition: "transform .1s ease",
    }}
      onMouseDown={(e) => !busy && (e.currentTarget.style.transform = "scale(0.98)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</span>
        {rec === id && (
          <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 6px", borderRadius: 5, background: primary ? "rgba(255,255,255,0.2)" : "var(--clay-bg)", color: primary ? "#fff" : "var(--clay-deep)" }}>Recommended</span>
        )}
      </div>
      {detail && <div style={{ fontSize: 11.5, color: primary ? "rgba(255,255,255,0.85)" : "var(--muted)", marginTop: 3, lineHeight: 1.35 }}>{detail}</div>}
    </button>
  );

  return (
    <div className="rise" style={{ border: "1px solid var(--clay)", background: "var(--clay-bg)", borderRadius: 16, padding: 18, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
        <span style={{ width: 40, height: 40, borderRadius: 11, flex: "0 0 auto", background: "rgba(189,93,58,0.13)", color: "var(--clay-deep)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <WeatherGlyph wet={weather.isBad} />
        </span>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ color: "var(--clay-deep)" }}>Weather watch</div>
          <div className="serif" style={{ fontSize: 19, color: "var(--ink)", lineHeight: 1.2, margin: "2px 0 4px" }}>
            {weather.severe ? "Rough weather" : "Rain likely"} on {weather.weekday} in {weather.location.split(",")[0]}
          </div>
          <p style={{ fontSize: 13.5, color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>{weather.summary}</p>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "14px 0" }}>
        <Chip label="Condition" value={weather.condition} />
        <Chip label="Rain" value={`${weather.precipProb}%`} />
        <Chip label="High" value={`${f(weather.tempMaxC)}°F`} />
        <Chip label="Wind" value={`${weather.windMaxKmh} km/h`} />
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", marginBottom: 9 }}>What should the launch do?</div>
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
        {weather.altDay && (
          <Opt id="reschedule" primary={rec === "reschedule"}
            title={`Move to ${weather.altDay.weekday}`}
            detail={`${weather.altDay.condition}, ${weather.altDay.precipProb}% rain. Re-plans the week.`}
            onClick={onReschedule} />
        )}
        <Opt id="rain_plan" primary={rec === "rain_plan"}
          title="Keep it, add a rain plan"
          detail={weather.rainPlanNote || "Rain-or-shine messaging on the event day."}
          onClick={onRainPlan} />
        <Opt id="proceed" primary={rec === "proceed"}
          title="Post as planned"
          detail="Ignore the forecast and run the week as is."
          onClick={onProceed} />
      </div>
      {busy && <div style={{ fontSize: 12, color: "var(--clay-deep)", marginTop: 11 }}>Re-planning around the new day...</div>}
    </div>
  );
}

export function LumaEventCard({ luma, creating }: { luma: LumaEvent | null; creating: boolean }) {
  if (creating) {
    return (
      <div className="rise" style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 14, padding: "13px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 11 }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--clay)" strokeWidth={2.4} style={{ animation: "spin360 0.9s linear infinite" }}><path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" /></svg>
        <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Creating the Luma event...</span>
      </div>
    );
  }
  if (!luma) return null;
  const when = (() => { try { return new Date(luma.startAt).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }); } catch { return ""; } })();
  return (
    <div className="rise" style={{ border: "1px solid var(--border-strong)", background: "var(--card)", borderRadius: 14, padding: 16, marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
      <span style={{ width: 38, height: 38, borderRadius: 10, flex: "0 0 auto", background: "var(--ink)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8}><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="eyebrow" style={{ color: "var(--faint)" }}>Luma event created</div>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{luma.name}</div>
        {when && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{when}</div>}
      </div>
      {luma.url && (
        <a href={luma.url} target="_blank" rel="noopener noreferrer" style={{
          flex: "0 0 auto", textDecoration: "none", background: "var(--clay)", color: "#fff",
          fontWeight: 600, fontSize: 13, padding: "9px 15px", borderRadius: 9,
        }}>Open event</a>
      )}
    </div>
  );
}

export function LumaConnectModal({ open, onClose, onConnected }: {
  open: boolean; onClose: () => void; onConnected: (key: string) => void;
}) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!open) return null;

  async function connect() {
    if (!key.trim()) { setErr("Paste your Luma API key."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/luma", { headers: { "x-luma-key": key.trim() } });
      const d = await r.json();
      if (d.connected) { onConnected(key.trim()); onClose(); }
      else setErr("That key did not verify. Check it in Luma settings.");
    } catch { setErr("Could not reach Luma. Try again."); }
    setBusy(false);
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,12,8,0.4)", backdropFilter: "blur(3px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="rise" style={{ width: "100%", maxWidth: 440, background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 18, padding: 24, boxShadow: "0 24px 60px rgba(0,0,0,0.25)" }}>
        <div className="serif" style={{ fontSize: 21, color: "var(--ink)", marginBottom: 5 }}>Connect Luma</div>
        <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 16px", lineHeight: 1.55 }}>
          Paste your Luma API key and event-mode launches will spin up a real Luma event page automatically.
          Find it in Luma under Settings, Developers.
        </p>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="luma-api-key..." type="password"
          onKeyDown={(e) => { if (e.key === "Enter") connect(); }}
          style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 10, border: "1px solid var(--border-strong)", background: "var(--card)", color: "var(--ink)", fontSize: 14 }} />
        {err && <p style={{ color: "var(--abort)", fontSize: 12.5, margin: "8px 0 0" }}>{err}</p>}
        <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: "0 0 auto", background: "transparent", border: "1px solid var(--border-strong)", color: "var(--text)", borderRadius: 9, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={connect} disabled={busy} style={{ flex: 1, background: "var(--clay)", border: 0, color: "#fff", borderRadius: 9, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
            {busy ? "Verifying..." : "Connect"}
          </button>
        </div>
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <a href="https://lu.ma/settings/developer" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--clay-deep)", textDecoration: "none" }}>Get a Luma API key</a>
        </div>
      </div>
    </div>
  );
}
