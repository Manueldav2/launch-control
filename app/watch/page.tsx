"use client";

// LIVE COMMENT WATCH — the demo showpiece. Point it at a published post; it
// polls the comments, drafts an in-voice reply to each NEW one, and (with
// auto-reply on) posts it back to the real platform. The audience comments and
// watches the replies land. Standalone route so it never collides with the
// main console UI.
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import KeyGate from "../KeyGate";
import { keyHeaders } from "@/lib/client-key";

type Reply = { id: string; comment: string; author: string; reply: string; posted: boolean; at: number };

export default function WatchPage() {
  const [postId, setPostId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [postText, setPostText] = useState("");
  const [voice, setVoice] = useState("warm, grateful, specific");
  const [autoReply, setAutoReply] = useState(false);
  const [watching, setWatching] = useState(false);
  const [polls, setPolls] = useState(0);
  const [feed, setFeed] = useState<Reply[]>([]);
  const [err, setErr] = useState("");
  const handled = useRef<Set<string>>(new Set());
  const busy = useRef(false);

  const poll = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...keyHeaders() },
        body: JSON.stringify({
          postId, accountId, postText, voice, autoReply,
          skipIds: [...handled.current],
        }),
      });
      const d = await r.json();
      setPolls((n) => n + 1);
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
  }, [postId, accountId, postText, voice, autoReply]);

  useEffect(() => {
    if (!watching) return;
    poll();
    const iv = setInterval(poll, 8000);
    return () => clearInterval(iv);
  }, [watching, poll]);

  const canStart = postId.trim() && accountId.trim();

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
          <KeyGate compact />
        </nav>
      </header>

      <section style={{ marginBottom: 22 }}>
        <p className="eyebrow" style={{ marginBottom: 10 }}>RESPONDER · LIVE</p>
        <h1 style={{ fontSize: "clamp(30px,4.5vw,46px)", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.02, margin: 0 }}>
          Someone comments.<br /><span style={{ color: "var(--ignite)" }}>The crew replies.</span>
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 15, marginTop: 12, maxWidth: 560, lineHeight: 1.6 }}>
          Point it at a live post. It watches the comments and answers each new one in your voice, in real time.
        </p>
      </section>

      {/* config */}
      <section style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 20, marginBottom: 20,
        background: "linear-gradient(180deg, var(--panel), var(--void-2))" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="POST ID" value={postId} onChange={setPostId} placeholder="the published post id" mono />
          <Field label="ACCOUNT ID" value={accountId} onChange={setAccountId} placeholder="the connected account id" mono />
        </div>
        <Field label="POST TEXT (context for replies)" value={postText} onChange={setPostText} placeholder="paste the post copy so replies make sense" />
        <Field label="REPLY VOICE" value={voice} onChange={setVoice} placeholder="how the replies should sound" />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, flexWrap: "wrap", gap: 12 }}>
          <button onClick={() => setAutoReply((v) => !v)} className="mono" style={{
            display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
            fontSize: 11, letterSpacing: "0.1em", padding: "8px 13px", borderRadius: 99,
            border: `1px solid ${autoReply ? "var(--go)" : "var(--line-bright)"}`,
            color: autoReply ? "var(--go)" : "var(--muted)", background: autoReply ? "rgba(52,211,154,0.08)" : "transparent",
          }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: autoReply ? "var(--go)" : "var(--faint)" }} />
            AUTO-REPLY {autoReply ? "ON · posts live" : "OFF · draft only"}
          </button>

          <button onClick={() => setWatching((w) => !w)} disabled={!canStart && !watching} className="mono" style={{
            cursor: canStart || watching ? "pointer" : "default", fontSize: 13, letterSpacing: "0.12em", fontWeight: 700,
            color: watching ? "var(--fg)" : "#160a02", padding: "12px 22px", borderRadius: 11, border: 0,
            background: watching ? "var(--panel)" : "linear-gradient(180deg, var(--ignite-2), var(--ignite))",
            boxShadow: watching ? "inset 0 0 0 1px var(--abort)" : "0 14px 36px -14px rgba(255,106,26,0.6)",
            opacity: !canStart && !watching ? 0.5 : 1,
          }}>
            {watching ? "■ STOP WATCH" : "▲ START WATCH"}
          </button>
        </div>
        {err && <p className="mono" style={{ color: "var(--abort)", marginTop: 12, fontSize: 12 }}>· {err}</p>}
      </section>

      {/* live status */}
      {watching && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--go)", boxShadow: "0 0 10px var(--go)", animation: "blink 1s steps(1) infinite" }} />
          <span className="mono" style={{ fontSize: 12, color: "var(--go)" }}>WATCHING · poll #{polls} · every 8s · {feed.length} replied</span>
        </div>
      )}

      {/* the live feed */}
      <div style={{ display: "grid", gap: 10 }}>
        {feed.length === 0 && watching && (
          <p className="mono" style={{ fontSize: 12, color: "var(--faint)", textAlign: "center", padding: "30px 0" }}>
            listening for comments…
          </p>
        )}
        {feed.map((r) => (
          <div key={r.id} className="rise" style={{ border: "1px solid var(--line)", borderRadius: 13, background: "var(--panel)", overflow: "hidden" }}>
            <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--line)" }}>
              <div className="mono" style={{ fontSize: 10.5, color: "var(--muted)", marginBottom: 4 }}>@{r.author} commented</div>
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

function Field({ label, value, onChange, placeholder, mono }:
  { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <label style={{ display: "block", marginTop: 12 }}>
      <span className="eyebrow" style={{ color: "var(--muted)", display: "block", marginBottom: 6 }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={mono ? "mono" : undefined}
        style={{ width: "100%", background: "var(--void)", border: "1px solid var(--line)", borderRadius: 9,
          padding: "11px 13px", color: "var(--fg)", fontSize: mono ? 13 : 14 }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--ignite)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--line)")} />
    </label>
  );
}
