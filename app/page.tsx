"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { saveAsset } from "@/lib/assets-store";

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

// One-click demo missions — also proves the engine reruns on any campaign.
const EXAMPLES = [
  { label: "Beach cleanup", goal: "Get 50 volunteers to our Saturday beach cleanup", cta: "Sign up at the link to join the cleanup", website: "https://www.surfrider.org" },
  { label: "Food drive", goal: "Fill 500 holiday meal boxes by Saturday's food drive", cta: "Donate or volunteer at the link", website: "https://www.feedingamerica.org" },
  { label: "Charity 5k", goal: "Sell out our Saturday charity 5k for clean water", cta: "Register at the link before spots run out", website: "https://www.charitywater.org" },
];
const MISSION_PLACEHOLDERS = [
  "Get 50 volunteers to our Saturday beach cleanup",
  "Fill the food drive this weekend",
  "Pack the start line of our charity 5k",
  "Rally the neighborhood for the park restoration",
];

export default function Home() {
  const [goal, setGoal] = useState("");
  const [cta, setCta] = useState("");
  const [website, setWebsite] = useState("");
  const [goalFocused, setGoalFocused] = useState(false);
  const typed = useTypewriter(MISSION_PLACEHOLDERS, !goal && !goalFocused);
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
        saveAsset({ url: d.url, contentType: slot.contentType, platform: slot.platform,
          day: plan.days[di].weekday, brand: plan.brand?.name || "", caption: slot.copy.slice(0, 120) });
      } else setErr(d.error || "render failed");
    } catch (e: any) { setErr(String(e.message || e)); }
    setMediaBusy(null);
  }

  const eventIndex = plan ? plan.days.findIndex((d) => d.isEventDay) : -1;
  const isVid = (t: string) => t === "ugc_video" || t === "motion_video";

  return (
    <main style={{ position: "relative", zIndex: 2, maxWidth: 1180, margin: "0 auto", padding: "0 24px 120px" }}>
      <div className="grain" />
      <EmberField />
      {loading && <LaunchSequence goal={goal} website={website} />}

      {/* ── masthead ───────────────────────────────────────────────────── */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "26px 0 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Igniter live={loading} />
          <span className="mono" style={{ fontSize: 12, letterSpacing: "0.16em", color: "var(--muted)" }}>
            LAUNCH&nbsp;CONTROL
          </span>
        </div>
        <nav style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--ignite)" }}>CONSOLE</span>
          <Link href="/assets" className="mono" style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--faint)", textDecoration: "none" }}>ASSETS</Link>
          <span className="eyebrow">CLAUDE · OPUS&nbsp;4.8</span>
        </nav>
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
          <FloatingTiles />
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
          <Field n="01" label="MISSION OBJECTIVE" value={goal} onChange={setGoal}
            placeholder={typed || "What are you trying to accomplish?"}
            onFocus={() => setGoalFocused(true)} onBlur={() => setGoalFocused(false)} />
          <Field n="02" label="CALL TO ACTION" value={cta} onChange={setCta} placeholder="What should people do?" />
          <Field n="03" label="TARGET SITE" value={website} onChange={setWebsite} placeholder="https://the-nonprofit.org" />

          {/* one-click missions — fast demo + proves it reruns on any campaign */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <span className="eyebrow" style={{ color: "var(--faint)" }}>TRY</span>
            {EXAMPLES.map((ex) => (
              <button key={ex.label} onClick={() => { setGoal(ex.goal); setCta(ex.cta); setWebsite(ex.website); }}
                className="mono" style={{
                  fontSize: 11, letterSpacing: "0.04em", cursor: "pointer", color: "var(--muted)",
                  background: "var(--void)", border: "1px solid var(--line)", borderRadius: 99, padding: "5px 12px",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--ignite)"; e.currentTarget.style.color = "var(--ember)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.color = "var(--muted)"; }}>
                {ex.label}
              </button>
            ))}
          </div>

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

function Field({ n, label, value, onChange, placeholder, onFocus, onBlur }:
  { n: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string;
    onFocus?: () => void; onBlur?: () => void }) {
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
        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--ignite)"; onFocus?.(); }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--line)"; onBlur?.(); }} />
    </label>
  );
}

// Cycling typewriter for the mission-objective placeholder — the AI-prompt feel.
// Types a phrase, holds, deletes, advances. Pauses entirely when `active` is false.
function useTypewriter(phrases: string[], active: boolean): string {
  const [out, setOut] = useState("");
  const st = useRef({ p: 0, i: 0, del: false });
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const s = st.current;
      const full = phrases[s.p % phrases.length];
      if (!s.del) {
        s.i++;
        setOut(full.slice(0, s.i));
        if (s.i >= full.length) { s.del = true; timer = setTimeout(tick, 1500); return; }
        timer = setTimeout(tick, 38 + Math.random() * 40);
      } else {
        s.i--;
        setOut(full.slice(0, Math.max(0, s.i)));
        if (s.i <= 0) { s.del = false; s.p++; timer = setTimeout(tick, 300); return; }
        timer = setTimeout(tick, 18);
      }
    };
    timer = setTimeout(tick, 260);
    return () => clearTimeout(timer);
  }, [active, phrases]);
  return active ? out : "";
}

// Count a number up from 0 — used so the GO tally "lands" on reveal.
function useCountUp(target: number, ms = 700): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setV(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function ReadinessBoard({ plan, scorecard, onReset }:
  { plan: Plan; scorecard: Scorecard; onReset: () => void }) {
  const allGo = scorecard.passing === scorecard.total;
  const goCount = useCountUp(scorecard.passing);
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
              {allGo ? "ALL SYSTEMS GO" : `${goCount}/${scorecard.total} GO`}
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

// ─── hero: floating content tiles suggesting the week of posts ────────────────
function FloatingTiles() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Edge-anchored so they frame the hero without crowding the headline.
  const tiles = [
    { p: "x", txt: "the tide doesn't clean itself. 9am Saturday. be there.", side: "left", top: 4, rot: -7, anim: "float1", dur: 7, delay: 0.9, type: "TEXT" },
    { p: "instagram", txt: "before / after — one morning, one beach", side: "left", top: 56, rot: 5, anim: "float2", dur: 8.5, delay: 1.1, type: "STILL" },
    { p: "linkedin", txt: "Why our team blocks off Saturday mornings for the coast.", side: "right", top: 8, rot: 6, anim: "float2", dur: 7.6, delay: 1.0, type: "TEXT" },
    { p: "instagram", txt: "60 sec: what 80 volunteers pulled off the sand", side: "right", top: 58, rot: -5, anim: "float1", dur: 9, delay: 1.25, type: "UGC FILM" },
  ];
  if (!mounted) return null;
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none" }}>
      {tiles.map((t, i) => (
        <div key={i} style={{
          position: "absolute", top: `${t.top}%`,
          [t.side]: "min(2vw, 12px)" as any,
          width: 188, ["--r" as any]: `${t.rot}deg`,
          animation: `tilein 0.7s cubic-bezier(0.16,1,0.3,1) ${t.delay}s both, ${t.anim} ${t.dur}s ease-in-out ${t.delay + 0.7}s infinite`,
        }}>
          <div style={{
            background: "linear-gradient(180deg, rgba(22,22,30,0.9), rgba(13,13,18,0.9))",
            border: "1px solid var(--line)", borderRadius: 12, padding: "11px 12px",
            boxShadow: "0 24px 50px -24px rgba(0,0,0,0.8)", backdropFilter: "blur(6px)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7, color: "var(--faint)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--muted)" }}>
                <PlatformGlyph p={t.p} />
                <span className="mono" style={{ fontSize: 8.5, letterSpacing: "0.08em" }}>{PLATFORM_LABEL[t.p]}</span>
              </span>
              <span className="mono" style={{ fontSize: 7.5, letterSpacing: "0.08em", border: "1px solid var(--line-bright)", borderRadius: 4, padding: "1px 5px" }}>{t.type}</span>
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.45, color: "var(--fg)", textAlign: "left", opacity: 0.85 }}>{t.txt}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8 }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: "var(--go)", boxShadow: "0 0 6px var(--go)" }} />
              <span className="mono" style={{ fontSize: 8, letterSpacing: "0.1em", color: "var(--go)" }}>GO</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── atmosphere: engine embers drifting up like exhaust ────────────────────────
function EmberField() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const embers = useMemo(() => {
    // deterministic so there's no SSR/client mismatch
    let s = 7;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    return Array.from({ length: 34 }, () => ({
      left: rnd() * 100,
      size: 1 + rnd() * 2.5,
      dur: 9 + rnd() * 12,
      delay: -rnd() * 18,
      dx: (rnd() - 0.5) * 80,
      o: 0.25 + rnd() * 0.5,
    }));
  }, []);
  if (!mounted) return null;
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
      {embers.map((e, i) => (
        <span key={i} style={{
          position: "absolute", bottom: -10, left: `${e.left}%`,
          width: e.size, height: e.size, borderRadius: 99,
          background: i % 5 === 0 ? "var(--ignite-2)" : "var(--ignite)",
          boxShadow: `0 0 ${e.size * 3}px var(--ignite)`,
          ["--dx" as any]: `${e.dx}px`, ["--o" as any]: e.o,
          animation: `emberrise ${e.dur}s linear ${e.delay}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ─── the launch sequence: a cinematic takeover while the swarm works ───────────
const SEQ_PHASES = [
  "ACQUIRE TARGET", "PLOT 7-DAY ARC", "DRAFT ALL CHANNELS",
  "CRITIC · GRADE", "CRITIC · CORRECT", "FINALIZE",
];

function LaunchSequence({ goal, website }: { goal: string; website: string }) {
  const host = (() => { try { return new URL(website.startsWith("http") ? website : `https://${website}`).host; } catch { return website || "target"; } })();
  const SCRIPT = useMemo(() => [
    `establishing uplink to ${host || "target"}`,
    "reading mission brief",
    `objective locked · "${goal.slice(0, 46)}${goal.length > 46 ? "…" : ""}"`,
    "strategist: locking the 7-day arc to the event",
    "x-writer · linkedin-writer · instagram-writer drafting in parallel",
    "critic: scanning every draft for AI-tells + fabrication",
    "critic: flagged a hype phrase on day 3 — rewriting",
    "critic: re-grade → GO",
    "media: prepping render prompts",
    "compiling launch readiness…",
  ], [goal, host]);

  const [phase, setPhase] = useState(0);
  const [lines, setLines] = useState<string[]>([]);
  const [pct, setPct] = useState(6);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ph = setInterval(() => setPhase((p) => Math.min(p + 1, SEQ_PHASES.length - 1)), 1500);
    let i = 0;
    const lg = setInterval(() => {
      if (i < SCRIPT.length) { setLines((l) => [...l, SCRIPT[i]]); i++; }
    }, 620);
    // asymptotic charge toward ~93% (completes for real when the overlay unmounts)
    const ch = setInterval(() => setPct((p) => p + (93 - p) * 0.08), 140);
    return () => { clearInterval(ph); clearInterval(lg); clearInterval(ch); };
  }, [SCRIPT]);

  useEffect(() => { logRef.current?.scrollTo({ top: 1e6 }); }, [lines]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50, animation: "fadein 0.3s ease both",
      background: "radial-gradient(900px 600px at 50% 35%, rgba(255,106,26,0.10), rgba(8,8,11,0.92) 70%)",
      backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        width: "min(720px, 94vw)", border: "1px solid var(--line-bright)", borderRadius: 18,
        background: "linear-gradient(180deg, rgba(17,17,24,0.96), rgba(8,8,11,0.96))",
        boxShadow: "0 60px 160px -50px rgba(0,0,0,0.9), 0 0 80px -40px rgba(255,106,26,0.5)",
        padding: 26, position: "relative", overflow: "hidden",
      }}>
        {/* sweep line */}
        <span style={{ position: "absolute", top: 0, width: "30%", height: 2, background: "linear-gradient(90deg, transparent, var(--ignite), transparent)", animation: "sweep 2.4s linear infinite" }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span className="eyebrow" style={{ color: "var(--ignite)" }}>● LAUNCH SEQUENCE RUNNING</span>
          <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{Math.round(pct)}%</span>
        </div>

        <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 4px" }}>
          The crew is building your week.
        </h2>
        <p className="mono" style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 20px" }}>
          plan → draft → grade → correct · nothing ships until the critic says GO
        </p>

        {/* charging bar */}
        <div style={{ height: 8, borderRadius: 99, background: "var(--void)", border: "1px solid var(--line)", overflow: "hidden", marginBottom: 22 }}>
          <div style={{
            width: `${pct}%`, height: "100%", borderRadius: 99,
            background: "linear-gradient(90deg, var(--ignite), var(--ember), var(--ignite))",
            backgroundSize: "200% 100%", animation: "charge 1.4s linear infinite",
            transition: "width 0.2s ease", boxShadow: "0 0 16px var(--ignite)",
          }} />
        </div>

        {/* phase rail */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${SEQ_PHASES.length}, 1fr)`, gap: 6, marginBottom: 20 }}>
          {SEQ_PHASES.map((ph, i) => {
            const done = i < phase, active = i === phase;
            return (
              <div key={ph} style={{ textAlign: "center" }}>
                <div style={{
                  height: 3, borderRadius: 2, marginBottom: 7,
                  background: done ? "var(--go)" : active ? "var(--ignite)" : "var(--line-bright)",
                  boxShadow: active ? "0 0 10px var(--ignite)" : "none",
                  animation: active ? "glowpulse 1s ease-in-out infinite" : "none",
                }} />
                <span className="mono" style={{ fontSize: 8.5, letterSpacing: "0.06em", color: done ? "var(--go)" : active ? "var(--fg)" : "var(--faint)" }}>{ph}</span>
              </div>
            );
          })}
        </div>

        {/* telemetry log */}
        <div ref={logRef} style={{
          height: 132, overflow: "hidden", background: "var(--void)", border: "1px solid var(--line)",
          borderRadius: 10, padding: "10px 13px",
        }}>
          {lines.map((l, i) => (
            <div key={i} className="mono" style={{
              fontSize: 11.5, lineHeight: 1.7, color: i === lines.length - 1 ? "var(--ember)" : "var(--muted)",
              animation: "logline 0.25s ease both",
            }}>
              <span style={{ color: "var(--ignite)" }}>›</span> {l}
            </div>
          ))}
          <span className="mono" style={{ fontSize: 11.5, color: "var(--ignite)", animation: "blink 1s steps(1) infinite" }}>▋</span>
        </div>
      </div>
    </div>
  );
}
