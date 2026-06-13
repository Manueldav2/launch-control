"use client";

/**
 * /channels — the Channels hub. One place to see each platform's connection
 * status, how many posts the week has for it, and a way into its environment
 * (the in-the-wild feed preview). Consumes the engine's GET /api/connect
 * ({profileId, accounts:[{channel}], connect:{x,linkedin,instagram}}) and
 * degrades gracefully when the API or a connection is absent.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { WeekPlan, Platform } from "@/lib/types";
import { loadPlanLocal, DEMO_WEEK } from "../calendar/plan-store";

const PLATFORMS: Array<{ p: Platform; label: string; color: string; glyph: React.ReactNode; blurb: string }> = [
  { p: "x", label: "X", color: "#0f0f0f", blurb: "Timeline · short, punchy, scroll-stopping", glyph: <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M18.9 1.2h3.7l-8 9.1L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 1.2h7.6l5.2 6.9 6.1-6.9zm-1.3 19.4h2L6.5 3.3H4.4l13.2 17.3z"/></svg> },
  { p: "linkedin", label: "LinkedIn", color: "#0a66c2", blurb: "Feed · credibility, proof, the business case", glyph: <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M4.98 3.5a2.5 2.5 0 11-.02 5.001A2.5 2.5 0 014.98 3.5zM3 9h4v12H3V9zm6 0h3.8v1.7h.05c.53-1 1.83-2.05 3.76-2.05C20.5 8.65 22 10.5 22 14v7h-4v-6.2c0-1.5-.03-3.4-2.07-3.4-2.07 0-2.39 1.6-2.39 3.3V21H9V9z"/></svg> },
  { p: "instagram", label: "Instagram", color: "#e1306c", blurb: "Grid · the visual story, faces, before/after", glyph: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#fff" stroke="none"/></svg> },
];

type ConnectState = { accounts?: Array<{ channel?: string }>; connect?: Record<string, string>; loaded: boolean; ok: boolean };

export default function ChannelsHub() {
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [conn, setConn] = useState<ConnectState>({ loaded: false, ok: false });

  useEffect(() => {
    setPlan(loadPlanLocal() || DEMO_WEEK);
    let alive = true;
    fetch("/api/connect")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setConn({ accounts: d.accounts || [], connect: d.connect || {}, loaded: true, ok: true }))
      .catch(() => alive && setConn({ loaded: true, ok: false }));
    return () => { alive = false; };
  }, []);

  const counts: Record<string, number> = {};
  if (plan) for (const d of plan.days) for (const s of d.slots) counts[s.platform] = (counts[s.platform] || 0) + 1;
  const isConnected = (p: Platform) => !!conn.accounts?.some((a) => a.channel === p);

  const connect = (p: Platform) => {
    const url = conn.connect?.[p];
    if (url) window.open(url, "_blank");
    else window.open("/api/connect", "_blank");
  };

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 28px 64px" }}>
      <div className="eyebrow" style={{ color: "var(--clay-deep)" }}>Channels</div>
      <h1 className="serif" style={{ fontSize: 34, color: "var(--ink)", margin: "4px 0 6px", lineHeight: 1.1 }}>Your channels</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 28px", maxWidth: 560, lineHeight: 1.55 }}>
        Connect an account to publish, and open any channel to see the week exactly as it will appear in the feed.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        {PLATFORMS.map(({ p, label, color, glyph, blurb }) => {
          const connected = isConnected(p);
          const n = counts[p] || 0;
          return (
            <div
              key={p}
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 18,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 40, height: 40, borderRadius: 10, background: color, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{glyph}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>{label}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{blurb}</div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontWeight: 600,
                    color: connected ? "var(--go)" : "var(--muted)",
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "var(--go)" : "var(--border-strong)" }} />
                  {!conn.loaded ? "Checking…" : connected ? "Connected" : "Not connected"}
                </span>
                <span style={{ marginLeft: "auto", color: "var(--faint)" }}>
                  {n} post{n === 1 ? "" : "s"} this week
                </span>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                <Link
                  href={`/channels/${p}`}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    textDecoration: "none",
                    background: "var(--clay)",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: 13.5,
                    padding: "9px 0",
                    borderRadius: 9,
                  }}
                >
                  Open channel
                </Link>
                {!connected && (
                  <button
                    type="button"
                    onClick={() => connect(p)}
                    style={{
                      flex: "0 0 auto",
                      background: "transparent",
                      border: "1px solid var(--border-strong)",
                      color: "var(--text)",
                      fontWeight: 600,
                      fontSize: 13.5,
                      padding: "9px 16px",
                      borderRadius: 9,
                      cursor: "pointer",
                    }}
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 22, fontSize: 12.5 }}>
        <Link href="/calendar" style={{ color: "var(--clay-deep)", fontWeight: 600, textDecoration: "none" }}>
          See the full content calendar →
        </Link>
      </div>
    </div>
  );
}
