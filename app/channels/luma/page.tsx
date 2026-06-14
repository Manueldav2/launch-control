"use client";

/**
 * /channels/luma — Luma as a channel. The Luma event integration already exists
 * (EventControls + /api/luma + client-luma); this surfaces it in the Channels
 * area like X/LinkedIn/Instagram: connection status, the live event page, and a
 * connect flow. Real data only — the event comes from the saved plan (created
 * via /api/luma), no placeholders.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { LumaEventCard, LumaConnectModal, LumaMark, type LumaEvent } from "../../EventControls";
import { getLumaKey } from "@/lib/client-luma";
import { loadPlanLocal } from "../../calendar/plan-store";

export default function LumaChannel() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [events, setEvents] = useState<LumaEvent[]>([]);

  const refresh = async () => {
    let evs: LumaEvent[] = [];
    let conn = !!getLumaKey();
    try {
      const r = await fetch("/api/luma");
      const d = await r.json();
      conn = conn || !!d.connected; // server may hold the key
      evs = Array.isArray(d.events) ? d.events : [];
    } catch { /* fall back to the local plan */ }
    const p = loadPlanLocal() as unknown as { luma?: LumaEvent | null } | null;
    if (p?.luma?.url && !evs.some((e) => e.url === p.luma!.url)) evs = [p.luma, ...evs];
    setConnected(conn);
    setEvents(evs);
  };
  useEffect(() => { refresh(); }, []);

  const mode = connected === null ? "loading" : connected ? "connected" : "disconnected";
  const chip =
    mode === "connected"
      ? { dot: "var(--go)", label: "Connected", color: "var(--go)" }
      : mode === "disconnected"
      ? { dot: "var(--border-strong)", label: "Not connected", color: "var(--muted)" }
      : { dot: "var(--border-strong)", label: "Loading…", color: "var(--muted)" };

  return (
    <div>
      {/* env bar */}
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "var(--card)", borderBottom: "1px solid var(--border)", padding: "10px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: chip.color, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 999, padding: "4px 10px" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: chip.dot }} />
          {chip.label}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
          <LumaMark size={18} radius={5} /> Luma events
        </span>
        <Link href="/channels" style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--clay-deep)", fontWeight: 600, textDecoration: "none" }}>
          All channels →
        </Link>
      </div>

      <div style={{ maxWidth: 620, margin: "0 auto", padding: "32px 24px 64px" }}>
        <div className="eyebrow" style={{ color: "var(--clay-deep)" }}>Luma</div>
        <h1 className="serif" style={{ fontSize: 30, color: "var(--ink)", margin: "4px 0 6px", lineHeight: 1.1 }}>Your events</h1>
        <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 24px", lineHeight: 1.55 }}>
          When a launch has a real date and place, Launch Control spins up a live Luma event page. They show up here.
        </p>

        {mode === "disconnected" && (
          <div style={{ background: "var(--card)", border: "1px dashed var(--border-strong)", borderRadius: 14, padding: "32px 24px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><LumaMark size={40} radius={12} /></div>
            <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 16 }}>Connect Luma</div>
            <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "8px auto 18px", maxWidth: 380, lineHeight: 1.5 }}>
              Add your Luma API key to publish event pages for your launches automatically.
            </p>
            <button type="button" onClick={() => setConnectOpen(true)} style={{ background: "var(--clay)", color: "#fff", border: "none", fontWeight: 600, fontSize: 14, padding: "10px 22px", borderRadius: 10, cursor: "pointer" }}>
              Connect Luma
            </button>
          </div>
        )}

        {events.length > 0 && (
          <div style={{ display: "grid", gap: 12 }}>
            {events.map((e) => <LumaEventCard key={e.id || e.url} luma={e} creating={false} />)}
          </div>
        )}

        {mode === "connected" && events.length === 0 && (
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "32px 24px", textAlign: "center" }}>
            <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 16 }}>No events yet</div>
            <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "8px auto 18px", maxWidth: 400, lineHeight: 1.5 }}>
              Luma is connected. Start a launch with a real date and location on the Console and an event page is created here automatically.
            </p>
            <Link href="/" style={{ display: "inline-block", background: "var(--clay)", color: "#fff", fontWeight: 600, fontSize: 14, padding: "10px 22px", borderRadius: 10, textDecoration: "none" }}>
              New launch
            </Link>
          </div>
        )}

        <LumaConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} onConnected={() => { setConnectOpen(false); refresh(); }} />
      </div>
    </div>
  );
}
