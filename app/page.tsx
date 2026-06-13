"use client";

import { useState, useEffect } from "react";

// ─── types (mirror lib/types.ts) ────────────────────────────────────────────
type Slot = {
  platform: string; reaction: string; contentType: string; copy: string;
  mediaPrompt?: string; mediaUrl?: string; grade?: { pass: boolean; failures: string[] };
};
type Day = { day: number; weekday: string; cta: string; theme: string; isEventDay: boolean; slots: Slot[] };
type Plan = { brand: { name: string; voice: string; summary: string; colors: string[] }; days: Day[] };
type Scorecard = { total: number; passing: number; fixed: number };

// ─── display maps ─────────────────────────────────────────────────────────────
const TYPE_LABEL: Record<string, string> = {
  text: "TEXT", image: "STILL", ugc_video: "UGC FILM", motion_video: "LAUNCH FILM",
};
const PLATFORM_LABEL: Record<string, string> = { x: "X", linkedin: "LINKEDIN", instagram: "INSTAGRAM" };

function PlatformGlyph({ p }: { p: string }) {
  const c = { width: 14, height: 14, fill: "currentColor" } as const;
  if (p === "x") return <svg viewBox="0 0 24 24" {...c}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>;
  if (p === "linkedin") return <svg viewBox="0 0 24 24" {...c}><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452z"/></svg>;
  return <svg viewBox="0 0 24 24" {...c}><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>;
}

// The crew — the visible swarm. Theater for "a team of agents", and honest: each
// maps to a real step in the pipeline.
const CREW = [
  { id: "strat", role: "STRATEGIST", station: "plans the 7-day arc" },
  { id: "wx", role: "X WRITER", station: "drafts every X post" },
  { id: "wli", role: "LINKEDIN WRITER", station: "drafts LinkedIn" },
  { id: "wig", role: "INSTAGRAM WRITER", station: "drafts Instagram" },
  { id: "critic", role: "CRITIC", station: "grades + rewrites" },
  { id: "media", role: "MEDIA", station: "renders film + stills" },
];

export default function Home() {
  const [goal, setGoal] = useState("Get 50 volunteers to our Saturday beach cleanup");
  const [cta, setCta] = useState("Sign up at the link to join the cleanup");
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [mediaBusy, setMediaBusy] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // crew animation cursor while generating
  useEffect(() => {
    if (!loading) return;
    const iv = setInterval(() => setTick((t) => t + 1), 700);
    return () => clearInterval(iv);
  }, [loading]);

  async function generate() {
    setErr(""); setLoading(true); setPlan(null); setScorecard(null); setTick(0);
    try {
      const r = await fetch("/api/generate-week", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, cta, website }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "launch sequence failed");
      setPlan(d.plan); setScorecard(d.scorecard);
    } catch (e: any) { setErr(String(e.message || e)); }
    setLoading(false);
  }

  async function makeMedia(di: number, si: number) {
    if (!plan) return;
    const slot = plan.days[di].slots[si];
    const id = `${di}:${si}`;
    setMediaBusy(id); setErr("");
    try {
      const r = await fetch("/api/generate-media", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: slot.contentType, prompt: slot.mediaPrompt || slot.copy }),
      });
      const d = await r.json();
      if (d.url) {
        const next = structuredClone(plan);
        next.days[di].slots[si].mediaUrl = d.url;
        setPlan(next);
      } else setErr(d.error || "render failed");
    } catch (e: any) { setErr(String(e.message || e)); }
    setMediaBusy(null);
  }

  const eventIndex = plan ? plan.days.findIndex((d) => d.isEventDay) : -1;
  const isVid = (t: string) => t === "ugc_video" || t === "motion_video";

  return (
    <main style={{ position: "relative", zIndex: 2, maxWidth: 1180, margin: "0 auto", padding: "0 24px 120px" }}>
      <div className="grain" />

      {/* ── masthead ───────────────────────────────────────────────────── */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "26px 0 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Igniter live={loading} />
          <span className="mono" style={{ fontSize: 12, letterSpacing: "0.16em", color: "var(--muted)" }}>
            LAUNCH&nbsp;CONTROL
          </span>
        </div>
        <span className="eyebrow">CLAUDE · OPUS&nbsp;4.8</span>
      </header>

      {/* ── hero ───────────────────────────────────────────────────────── */}
      {!plan && (
        <section style={{ position: "relative", textAlign: "center", marginBottom: 48 }}>
          <div style={{
            position: "absolute", inset: "-40% 0 auto 0", height: 420, zIndex: -1,
            background: "radial-gradient(closest-side, rgba(255,106,26,0.22), transparent 70%)",
            animation: "glowpulse 5s ease-in-out infinite",
          }} />
          <p className="eyebrow rise" style={{ marginBottom: 18 }}>SOCIAL LAUNCH · AUTONOMOUS</p>
          <h1 className="rise" style={{
            fontSize: "clamp(44px, 7vw, 88px)", fontWeight: 800, lineHeight: 0.96,
            letterSpacing: "-0.03em", margin: 0, animationDelay: "60ms",
          }}>
            A whole week of launch,<br />
            <span style={{ color: "var(--ignite)" }}>from one sentence.</span>
          </h1>
          <p className="rise" style={{
            maxWidth: 620, margin: "22px auto 0", color: "var(--muted)", fontSize: 17, lineHeight: 1.6,
            animationDelay: "120ms",
          }}>
            Give it the mission, the call to action, and a website. A crew of Claude
            agents plans seven days of content, writes it on-brand, films it, and
            grades its own work before a single post goes out.
          </p>
        </section>
      )}

      {/* ── console: inputs ────────────────────────────────────────────── */}
      {!plan && (
        <section className="rise" style={{
          maxWidth: 760, margin: "0 auto", animationDelay: "180ms",
          background: "linear-gradient(180deg, var(--panel) 0%, var(--void-2) 100%)",
          border: "1px solid var(--line)", borderRadius: 18, padding: 26,
          boxShadow: "0 40px 120px -40px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.03)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <span className="eyebrow">FLIGHT&nbsp;PARAMETERS</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>03&nbsp;REQUIRED</span>
          </div>
          <Field n="01" label="MISSION OBJECTIVE" value={goal} onChange={setGoal} placeholder="What are you trying to accomplish?" />
          <Field n="02" label="CALL TO ACTION" value={cta} onChange={setCta} placeholder="What should people do?" />
          <Field n="03" label="TARGET SITE" value={website} onChange={setWebsite} placeholder="https://the-nonprofit.org" />

          <button onClick={generate} disabled={loading} style={{
            marginTop: 22, width: "100%", border: 0, cursor: loading ? "default" : "pointer",
            borderRadius: 12, padding: "16px 20px", fontFamily: "var(--font-mono)",
            fontSize: 14, letterSpacing: "0.14em", fontWeight: 700, color: "#160a02",
            background: loading
              ? "linear-gradient(180deg, #3a3a44, #2a2a32)"
              : "linear-gradient(180deg, var(--ignite-2), var(--ignite))",
            boxShadow: loading ? "none" : "0 16px 40px -12px rgba(255,106,26,0.6), inset 0 1px 0 rgba(255,255,255,0.4)",
            transition: "transform 0.12s ease",
          }}
            onMouseDown={(e) => !loading && (e.currentTarget.style.transform = "scale(0.99)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}>
            {loading ? "▮ RUNNING LAUNCH SEQUENCE…" : "▲ INITIATE LAUNCH SEQUENCE"}
          </button>
          {err && <p className="mono" style={{ color: "var(--abort)", marginTop: 14, fontSize: 12 }}>ABORT · {err}</p>}
        </section>
      )}

      {/* ── crew roster ────────────────────────────────────────────────── */}
      {!plan && (
        <section className="rise" style={{ maxWidth: 760, margin: "26px auto 0", animationDelay: "240ms" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px,1fr))", gap: 8 }}>
            {CREW.map((c, i) => {
              const active = loading && i <= (tick % (CREW.length + 1));
              return (
                <div key={c.id} style={{
                  border: `1px solid ${active ? "var(--ignite)" : "var(--line)"}`,
                  background: active ? "rgba(255,106,26,0.07)" : "var(--panel)",
                  borderRadius: 10, padding: "10px 11px", transition: "all 0.3s ease",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: 99,
                      background: active ? "var(--go)" : "var(--faint)",
                      boxShadow: active ? "0 0 8px var(--go)" : "none",
                      animation: active ? "blink 1s steps(1) infinite" : "none",
                    }} />
                    <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.08em", color: active ? "var(--fg)" : "var(--faint)" }}>{c.role}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 5, lineHeight: 1.3 }}>{c.station}</div>
                </div>
              );
            })}
          </div>
          {loading && (
            <p className="mono" style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "var(--muted)" }}>
              crew working in parallel · the critic is grading every draft before it ships
            </p>
          )}
        </section>
      )}

      {/* ── results: readiness + flight plan ───────────────────────────── */}
      {plan && scorecard && (
        <>
          <ReadinessBoard plan={plan} scorecard={scorecard} onReset={() => { setPlan(null); setScorecard(null); }} />
          {err && <p className="mono" style={{ color: "var(--abort)", margin: "0 0 18px", fontSize: 12 }}>· {err}</p>}
          <div style={{ display: "grid", gap: 14 }}>
            {plan.days.map((day, di) => (
              <DayCard key={day.day} day={day} di={di} eventIndex={eventIndex}
                mediaBusy={mediaBusy} onMakeMedia={makeMedia} isVid={isVid} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

// ─── pieces ───────────────────────────────────────────────────────────────────

function Igniter({ live }: { live: boolean }) {
  return (
    <span style={{ position: "relative", width: 16, height: 16, display: "inline-block" }}>
      <span style={{
        position: "absolute", inset: 0, borderRadius: 99,
        background: "radial-gradient(circle, var(--ignite-2), var(--ignite) 60%, transparent)",
        boxShadow: "0 0 14px var(--ignite)",
        animation: live ? "flamewob 0.7s ease-in-out infinite" : "glowpulse 3s ease-in-out infinite",
      }} />
    </span>
  );
}

function Field({ n, label, value, onChange, placeholder }:
  { n: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
        <span className="mono" style={{ fontSize: 10, color: "var(--ignite)" }}>{n}</span>
        <span className="eyebrow" style={{ color: "var(--muted)" }}>{label}</span>
      </div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{
        width: "100%", background: "var(--void)", border: "1px solid var(--line)",
        borderRadius: 10, padding: "13px 14px", color: "var(--fg)", fontSize: 15,
        transition: "border-color 0.15s ease",
      }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--ignite)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--line)")} />
    </label>
  );
}

function ReadinessBoard({ plan, scorecard, onReset }:
  { plan: Plan; scorecard: Scorecard; onReset: () => void }) {
  const allGo = scorecard.passing === scorecard.total;
  return (
    <section className="rise" style={{
      marginBottom: 22, border: `1px solid ${allGo ? "rgba(52,211,154,0.4)" : "var(--line)"}`,
      borderRadius: 16, padding: "20px 22px", background: "linear-gradient(180deg, var(--panel), var(--void-2))",
      boxShadow: allGo ? "0 24px 80px -40px rgba(52,211,154,0.35)" : "none",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 8 }}>LAUNCH READINESS · {plan.brand?.name || "MISSION"}</p>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <span style={{
              fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em",
              color: allGo ? "var(--go)" : "var(--hold)",
            }}>
              {allGo ? "ALL SYSTEMS GO" : `${scorecard.passing}/${scorecard.total} GO`}
            </span>
          </div>
          <p className="mono" style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
            {scorecard.total} posts graded · {scorecard.fixed} auto-corrected by the critic before launch
          </p>
        </div>
        <button onClick={onReset} className="mono" style={{
          background: "transparent", border: "1px solid var(--line-bright)", color: "var(--muted)",
          borderRadius: 9, padding: "9px 14px", fontSize: 11, letterSpacing: "0.12em", cursor: "pointer",
        }}>↻ NEW MISSION</button>
      </div>
      {/* GO/NO-GO poll bar */}
      <div style={{ display: "flex", gap: 4, marginTop: 16 }}>
        {plan.days.flatMap((d) => d.slots).map((s, i) => (
          <div key={i} title={s.grade?.pass ? "GO" : (s.grade?.failures.join(", ") || "")} style={{
            flex: 1, height: 6, borderRadius: 3,
            background: s.grade?.pass ? "var(--go)" : "var(--abort)",
            opacity: s.grade?.pass ? 0.85 : 0.9,
          }} />
        ))}
      </div>
    </section>
  );
}

function tminus(eventIndex: number, di: number): { label: string; event: boolean } {
  if (eventIndex < 0) return { label: `DAY ${di + 1}`, event: false };
  const off = eventIndex - di;
  if (off === 0) return { label: "T-0 · LAUNCH", event: true };
  if (off > 0) return { label: `T-${off}`, event: false };
  return { label: `T+${Math.abs(off)}`, event: false };
}

function DayCard({ day, di, eventIndex, mediaBusy, onMakeMedia, isVid }: {
  day: Day; di: number; eventIndex: number; mediaBusy: string | null;
  onMakeMedia: (di: number, si: number) => void; isVid: (t: string) => boolean;
}) {
  const t = tminus(eventIndex, di);
  return (
    <div className="rise" style={{
      animationDelay: `${di * 50}ms`,
      border: `1px solid ${t.event ? "var(--ignite)" : "var(--line)"}`,
      borderRadius: 16, background: t.event ? "rgba(255,106,26,0.05)" : "var(--panel)",
      overflow: "hidden",
      boxShadow: t.event ? "0 20px 60px -30px rgba(255,106,26,0.5)" : "none",
    }}>
      {/* day header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
        <span className="mono" style={{
          fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
          color: t.event ? "var(--ignite)" : "var(--muted)", minWidth: 78,
        }}>{t.label}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{day.weekday}</div>
          <div style={{ fontSize: 12.5, color: "var(--faint)" }}>{day.theme}</div>
        </div>
        <div style={{ textAlign: "right", maxWidth: "55%" }}>
          <span className="eyebrow" style={{ color: "var(--faint)" }}>TODAY&apos;S CTA</span>
          <div style={{ fontSize: 13, color: "var(--ember)", lineHeight: 1.35, marginTop: 2 }}>{day.cta}</div>
        </div>
      </div>
      {/* slots */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 1, background: "var(--line)" }}>
        {day.slots.map((slot, si) => (
          <SlotCard key={si} slot={slot} busy={mediaBusy === `${di}:${si}`}
            onRender={() => onMakeMedia(di, si)} isVid={isVid} />
        ))}
      </div>
    </div>
  );
}

function SlotCard({ slot, busy, onRender, isVid }:
  { slot: Slot; busy: boolean; onRender: () => void; isVid: (t: string) => boolean }) {
  const go = slot.grade?.pass;
  return (
    <div style={{ background: "var(--panel)", padding: 15 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--fg)" }}>
          <PlatformGlyph p={slot.platform} />
          <span className="mono" style={{ fontSize: 11, letterSpacing: "0.08em" }}>{PLATFORM_LABEL[slot.platform] || slot.platform}</span>
        </span>
        <span className="mono" style={{
          fontSize: 9.5, letterSpacing: "0.1em", color: "var(--faint)",
          border: "1px solid var(--line-bright)", borderRadius: 5, padding: "2px 7px",
        }}>{TYPE_LABEL[slot.contentType] || slot.contentType}</span>
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginBottom: 9 }}>
        <span className="mono" style={{ fontSize: 9, color: "var(--ignite)" }}>↳</span>
        <span style={{ fontSize: 11.5, color: "var(--muted)", fontStyle: "italic", lineHeight: 1.4 }}>{slot.reaction}</span>
      </div>

      <p style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap", margin: 0, color: "var(--fg)" }}>{slot.copy}</p>

      {slot.mediaUrl && (isVid(slot.contentType)
        ? <video src={slot.mediaUrl} controls playsInline style={{ width: "100%", borderRadius: 9, marginTop: 11 }} />
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={slot.mediaUrl} alt="" style={{ width: "100%", borderRadius: 9, marginTop: 11 }} />)}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        {slot.grade && (
          <span className="mono" style={{ fontSize: 10.5, letterSpacing: "0.08em", color: go ? "var(--go)" : "var(--abort)" }}>
            {go ? "● GO" : `● NO-GO · ${slot.grade.failures.slice(0, 2).join(", ")}`}
          </span>
        )}
        {(slot.contentType === "image" || isVid(slot.contentType)) && !slot.mediaUrl && (
          <button onClick={onRender} disabled={busy} className="mono" style={{
            fontSize: 10.5, letterSpacing: "0.1em", cursor: busy ? "default" : "pointer",
            background: "transparent", color: busy ? "var(--hold)" : "var(--ignite)",
            border: `1px solid ${busy ? "var(--hold)" : "var(--ignite)"}`, borderRadius: 7, padding: "5px 11px",
          }}>
            {busy ? "▮ RENDERING…" : `▲ RENDER ${TYPE_LABEL[slot.contentType]}`}
          </button>
        )}
      </div>
    </div>
  );
}
