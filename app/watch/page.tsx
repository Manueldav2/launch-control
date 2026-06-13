"use client";

// LIVE COMMENT WATCH — the demo showpiece. It scans EVERY published post across
// EVERY connected platform, drafts an in-voice reply to each new comment, and
// (auto-reply on) posts it back to the real platform in real time. No setup: it
// finds the posts itself via /api/cron/watch. The audience comments anywhere and
// watches the replies land. Standalone route so it never collides with the console.
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

type Reply = { id: string; channel: string; comment: string; author: string; reply: string; posted: boolean; at: number };

export default function WatchPage() {
  const [autoReply, setAutoReply] = useState(true);
  const [watching, setWatching] = useState(false);
  const [polls, setPolls] = useState(0);
  const [channels, setChannels] = useState<string[]>([]);
  const [feed, setFeed] = useState<Reply[]>([]);
  const [err, setErr] = useState("");
  const handled = useRef<Set<string>>(new Set());
  const busy = useRef(false);
  const autoRef = useRef(autoReply);
  useEffect(() => { autoRef.current = autoReply; }, [autoReply]);

  const poll = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await fetch(`/api/cron/watch?reply=${autoRef.current ? 1 : 0}`);
      const d = await r.json();
      setPolls((n) => n + 1);
      if (d.channels) setChannels(d.channels);
      if (d.error) { setErr(d.error); return; }
      setErr("");
      const fresh: Reply[] = (d.replies || []).filter((x: Reply) => x.id && !handled.current.has(x.id));
      if (fresh.length) {
        fresh.forEach((x) => handled.current.add(x.id));
        setFeed((f) => [...fresh.map((x) => ({ ...x, at: Date.now() })), ...f]);
      }
    } catch (e: any) {
      setErr(String(e.message || e));
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!watching) return;
    poll();
    const iv = setInterval(poll, 8000);
    return () => clearInterval(iv);
  }, [watching, poll]);

  return (
    <main style={{ position: "relative", zIndex: 2, maxWidth: 920, margin: "0 auto", padding: "26px 24px 120px" }}>
      <div className="grain" />

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 14, height: 14, borderRadius: 99,
            background: "radial-gradient(circle, var(--ignite-2), var(--ignite) 60%, transparent)",
            boxShadow: "0 0 14px var(--ignite)", animation: watching ? "flamewob 0.7s ease-in-out infinite" : "glowpulse 3s ease-in-out infinite" }} />
          <span className="mono" style={{ fontSize: 12, letterSpacing: "0.16em", color: "var(--muted)" }}>LAUNCH&nbsp;CONTROL</span>
        </div>
        <nav style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Link href="/" className="mono" style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--faint)", textDecoration: "none" }}>CONSOLE</Link>
          <span className="mono" style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--ignite)" }}>COMMENT&nbsp;WATCH</span>
        </nav>
      </header>

      <section style={{ marginBottom: 22 }}>
        <p className="eyebrow" style={{ marginBottom: 10 }}>RESPONDER · LIVE · ALL PLATFORMS</p>
        <h1 style={{ fontSize: "clamp(30px,4.5vw,46px)", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.02, margin: 0 }}>
          Anyone comments.<br /><span style={{ color: "var(--ignite)" }}>The crew replies to everyone.</span>
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 15, marginTop: 12, maxWidth: 580, lineHeight: 1.6 }}>
          It watches every published post across {channels.length ? channels.map((c) => c.toUpperCase()).join(" · ") : "X · LinkedIn · Instagram · TikTok"} and answers each new comment in your voice, in real time.
        </p>
      </section>

      {/* controls */}
      <section style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 20, marginBottom: 20,
        background: "linear-gradient(180deg, var(--panel), var(--void-2))", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <button onClick={() => setAutoReply((v) => !v)} className="mono" style={{
          display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
          fontSize: 11, letterSpacing: "0.1em", padding: "8px 13px", borderRadius: 99,
          border: `1px solid ${autoReply ? "var(--go)" : "var(--line-bright)"}`,
          color: autoReply ? "var(--go)" : "var(--muted)", background: autoReply ? "rgba(52,211,154,0.08)" : "transparent",
        }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: autoReply ? "var(--go)" : "var(--faint)" }} />
          AUTO-REPLY {autoReply ? "ON · posts live to every platform" : "OFF · draft only"}
        </button>

        <button onClick={() => setWatching((w) => !w)} className="mono" style={{
          cursor: "pointer", fontSize: 13, letterSpacing: "0.12em", fontWeight: 700,
          color: watching ? "var(--fg)" : "#160a02", padding: "12px 22px", borderRadius: 11, border: 0,
          background: watching ? "var(--panel)" : "linear-gradient(180deg, var(--ignite-2), var(--ignite))",
          boxShadow: watching ? "inset 0 0 0 1px var(--abort)" : "0 14px 36px -14px rgba(255,106,26,0.6)",
        }}>
          {watching ? "■ STOP WATCH" : "▲ START WATCH"}
        </button>
      </section>
      {err && <p className="mono" style={{ color: "var(--abort)", marginBottom: 12, fontSize: 12 }}>· {err}</p>}

      {watching && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--go)", boxShadow: "0 0 10px var(--go)", animation: "blink 1s steps(1) infinite" }} />
          <span className="mono" style={{ fontSize: 12, color: "var(--go)" }}>WATCHING · poll #{polls} · every 8s · {feed.length} replied across all platforms</span>
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {feed.length === 0 && watching && (
          <p className="mono" style={{ fontSize: 12, color: "var(--faint)", textAlign: "center", padding: "30px 0" }}>
            listening for comments on every post…
          </p>
        )}
        {feed.map((r) => (
          <div key={r.id} className="rise" style={{ border: "1px solid var(--line)", borderRadius: 13, background: "var(--panel)", overflow: "hidden" }}>
            <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--line)" }}>
              <div className="mono" style={{ fontSize: 10.5, color: "var(--muted)", marginBottom: 4 }}>@{r.author} commented · {String(r.channel || "").toUpperCase()}</div>
              <div style={{ fontSize: 13.5, color: "var(--fg)" }}>{r.comment}</div>
            </div>
            <div style={{ padding: "11px 14px", background: "rgba(255,106,26,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--ignite)" }}>↳ the crew replied</span>
                <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.08em", color: r.posted ? "var(--go)" : "var(--faint)" }}>
                  {r.posted ? "● POSTED LIVE" : "● DRAFT"}
                </span>
              </div>
              <div style={{ fontSize: 13.5, color: "var(--ember)" }}>{r.reply}</div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
