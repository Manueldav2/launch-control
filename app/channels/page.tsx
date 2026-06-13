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
import { LumaMark } from "../EventControls";
import { getLumaKey, setLumaKey } from "@/lib/client-luma";

const PLATFORMS: Array<{ p: string; label: string; color: string; glyph: React.ReactNode; blurb: string }> = [
  { p: "x", label: "X", color: "#0f0f0f", blurb: "Timeline · short, punchy, scroll-stopping", glyph: <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M18.9 1.2h3.7l-8 9.1L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 1.2h7.6l5.2 6.9 6.1-6.9zm-1.3 19.4h2L6.5 3.3H4.4l13.2 17.3z"/></svg> },
  { p: "linkedin", label: "LinkedIn", color: "#0a66c2", blurb: "Feed · credibility, proof, the business case", glyph: <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M4.98 3.5a2.5 2.5 0 11-.02 5.001A2.5 2.5 0 014.98 3.5zM3 9h4v12H3V9zm6 0h3.8v1.7h.05c.53-1 1.83-2.05 3.76-2.05C20.5 8.65 22 10.5 22 14v7h-4v-6.2c0-1.5-.03-3.4-2.07-3.4-2.07 0-2.39 1.6-2.39 3.3V21H9V9z"/></svg> },
  { p: "instagram", label: "Instagram", color: "#e1306c", blurb: "Grid · the visual story, faces, before/after", glyph: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#fff" stroke="none"/></svg> },
  { p: "tiktok", label: "TikTok", color: "#010101", blurb: "Vertical video · trends, sound-on, native feel", glyph: <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M16.5 2c.3 2.3 1.6 3.9 3.9 4.1v2.7c-1.4.1-2.7-.3-3.9-1v6.6c0 3.6-2.6 5.9-5.7 5.6-3-.3-4.9-2.9-4.4-5.9.4-2.4 2.4-4 4.8-3.9.3 0 .6.1.9.1v2.8c-.3-.1-.6-.2-1-.2-1.2 0-2.1 1-2 2.2.1 1.1 1 1.9 2.1 1.8 1.2-.1 1.9-1 1.9-2.2V2h3.4z"/></svg> },
];

type ConnectState = { accounts?: Array<{ channel?: string }>; connect?: Record<string, string>; loaded: boolean; ok: boolean };

export default function ChannelsHub() {
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [conn, setConn] = useState<ConnectState>({ loaded: false, ok: false });
  const [connecting, setConnecting] = useState<string | null>(null);
  const [lumaConnected, setLumaConnected] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setLumaConnected(!!getLumaKey());
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
  const isConnected = (p: string) => !!conn.accounts?.some((a) => a.channel === p);

  // Start the OAuth connect flow for one platform. Opening must happen in the
  // same click tick or Safari's popup blocker silently swallows it — so when we
  // already have the URL we open it synchronously and fall back to a same-tab
  // navigation (the standard OAuth pattern) if the popup was blocked. Only when
  // we have no cached URL do we fetch one, then navigate this tab.
  const openConnect = (url: string) => {
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w || w.closed) window.location.href = url; // popup blocked -> this tab
  };
  const connect = (p: string) => {
    const url = conn.connect?.[p];
    if (url) { openConnect(url); return; }
    setConnecting(p);
    fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: p }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.url) window.location.href = d.url;
        else throw new Error(d?.error || "no connect url");
      })
      .catch(() => {
        setConnecting(null);
        alert(`Could not start the ${p} connection. Please try again.`);
      });
  };

  const refreshConn = () => {
    fetch("/api/connect")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setConn({ accounts: d.accounts || [], connect: d.connect || {}, loaded: true, ok: true }))
      .catch(() => {});
  };
  const disconnect = (p: string) => {
    if (!window.confirm(`Disconnect ${p}? You can reconnect it anytime.`)) return;
    setBusy(p);
    fetch("/api/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: p }) })
      .then((r) => r.json())
      .then((d) => { if (!d.ok) throw new Error(d.error || "failed"); refreshConn(); })
      .catch(() => alert(`Could not disconnect ${p}. Please try again.`))
      .finally(() => setBusy(null));
  };
  const disconnectLuma = () => {
    if (!window.confirm("Disconnect Luma?")) return;
    setLumaKey("");
    setLumaConnected(false);
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
                    disabled={connecting === p}
                    style={{
                      flex: "0 0 auto",
                      background: "transparent",
                      border: "1px solid var(--border-strong)",
                      color: "var(--text)",
                      fontWeight: 600,
                      fontSize: 13.5,
                      padding: "9px 16px",
                      borderRadius: 9,
                      cursor: connecting === p ? "wait" : "pointer",
                      opacity: connecting === p ? 0.6 : 1,
                    }}
                  >
                    {connecting === p ? "Connecting…" : "Connect"}
                  </button>
                )}
                {connected && (
                  <button
                    type="button"
                    onClick={() => disconnect(p)}
                    disabled={busy === p}
                    title={`Disconnect ${label}`}
                    style={{
                      flex: "0 0 auto",
                      background: "transparent",
                      border: "1px solid var(--border-strong)",
                      color: "var(--abort)",
                      fontWeight: 600,
                      fontSize: 13.5,
                      padding: "9px 16px",
                      borderRadius: 9,
                      cursor: busy === p ? "wait" : "pointer",
                      opacity: busy === p ? 0.6 : 1,
                    }}
                  >
                    {busy === p ? "…" : "Disconnect"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Luma — events channel (separate integration from the social channels) */}
      <div style={{ marginTop: 16, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 18, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ flex: "0 0 auto", display: "flex" }}><LumaMark size={40} radius={10} /></span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>Luma</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Events · live event pages for launches with a date and place</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, marginTop: 6, color: lumaConnected ? "var(--go)" : "var(--muted)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: lumaConnected ? "var(--go)" : "var(--border-strong)" }} />
            {lumaConnected ? "Connected" : "Not connected"}
          </div>
        </div>
        <Link href="/channels/luma" style={{ flex: "0 0 auto", textAlign: "center", textDecoration: "none", background: "var(--clay)", color: "#fff", fontWeight: 600, fontSize: 13.5, padding: "9px 18px", borderRadius: 9 }}>
          Open channel
        </Link>
        {lumaConnected && (
          <button type="button" onClick={disconnectLuma} title="Disconnect Luma"
            style={{ flex: "0 0 auto", background: "transparent", border: "1px solid var(--border-strong)", color: "var(--abort)", fontWeight: 600, fontSize: 13.5, padding: "9px 16px", borderRadius: 9, cursor: "pointer" }}>
            Disconnect
          </button>
        )}
      </div>

      <div style={{ marginTop: 22, fontSize: 12.5 }}>
        <Link href="/calendar" style={{ color: "var(--clay-deep)", fontWeight: 600, textDecoration: "none" }}>
          See the full content calendar →
        </Link>
      </div>
    </div>
  );
}
