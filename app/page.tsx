"use client";

import { useState, useEffect, useRef } from "react";
import { Ic, Mark, PlatformGlyph } from "./icons";
import { savePlanLocal } from "./calendar/plan-store";
import { WeatherWatchCard, LumaEventCard, LumaConnectModal, LumaMark } from "./EventControls";
import type { WeatherWatch, LumaEvent } from "./EventControls";
import { getLumaKey, setLumaKey } from "@/lib/client-luma";
import { keyHeaders } from "@/lib/client-key";
import { authHeader } from "@/lib/client-auth";
import { useAuth } from "@/lib/use-auth";
import { falHeader } from "@/lib/client-fal";
import PublishBar from "./PublishBar";
import AuthBar from "./AuthBar";
import FalKeyModal from "./FalKeyModal";

// Scorecard derived from a saved plan's per-slot grades (for reopened projects).
function scoreOf(p: any): Scorecard {
  let total = 0, passing = 0;
  for (const d of p?.days || []) for (const s of d.slots || []) { total++; if (s.grade?.pass) passing++; }
  return { total, passing, fixed: 0 };
}

// ─── types (mirror lib/types.ts) ────────────────────────────────────────────
type VisualGrade = { pass: boolean; matchesIntent: boolean; onBrand: boolean; clean: boolean; issues: string[]; notes: string };
type Slot = {
  platform: string; reaction: string; contentType: string; copy: string;
  mediaPrompt?: string; mediaUrl?: string; grade?: { pass: boolean; failures: string[] };
  visualGrade?: VisualGrade; // visual critic verdict for the rendered still (set when renderMedia ran)
};
type Day = { day: number; weekday: string; cta: string; theme: string; isEventDay: boolean; weatherNote?: string; slots: Slot[] };
type PlanInputs = { goal: string; cta: string; website: string; eventWeekday?: string; location?: string };
type Plan = { brand: { name: string; voice: string; summary: string; colors: string[] }; days: Day[]; inputs?: PlanInputs; weather?: WeatherWatch | null; luma?: LumaEvent | null };
type Scorecard = { total: number; passing: number; fixed: number; mediaPassing?: number; mediaTotal?: number };

// A launch is "go somewhere" when a real location is set (not NA / online).
function isEventLocation(loc: string): boolean {
  const l = (loc || "").trim().toLowerCase();
  return !!l && !["na", "n/a", "none", "online"].includes(l);
}

// ─── display maps ─────────────────────────────────────────────────────────────
const TYPE_LABEL: Record<string, string> = {
  text: "Text", image: "Still", ugc_video: "UGC film", motion_video: "Launch film",
};
const PLATFORM_LABEL: Record<string, string> = { x: "X", linkedin: "LinkedIn", instagram: "Instagram" };

const EXAMPLES = [
  { label: "Beach cleanup", goal: "Get 100 volunteers to our Saturday Ocean Beach cleanup", cta: "RSVP to volunteer this Saturday, 9am at the Ocean Beach north lot", website: "https://surfrider.org", location: "Ocean Beach, San Francisco, CA" },
  { label: "Food drive", goal: "Fill 500 holiday meal boxes by Saturday's food drive", cta: "Come pack boxes, or donate at the link", website: "https://www.feedingamerica.org", location: "Austin, TX" },
  { label: "Charity 5k", goal: "Sell out our Saturday charity 5k for clean water", cta: "Register at the link before spots run out", website: "https://www.charitywater.org", location: "Prospect Park, Brooklyn, NY" },
];
const MISSION_PLACEHOLDERS = [
  "get 50 volunteers to our Saturday beach cleanup",
  "fill the food drive this weekend",
  "pack the start line of our charity 5k",
  "rally the neighborhood for the park restoration",
];

export default function Home() {
  const { user } = useAuth();
  const [goal, setGoal] = useState("");
  const [cta, setCta] = useState("");
  const [website, setWebsite] = useState("");
  const [location, setLocation] = useState("");
  const [goalFocused, setGoalFocused] = useState(false);
  const typed = useTypewriter(MISSION_PLACEHOLDERS, !goal && !goalFocused);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [mediaBusy, setMediaBusy] = useState<string | null>(null);
  const [reviewMedia, setReviewMedia] = useState(false);
  // event-mode state
  const [eventWeekday, setEventWeekday] = useState("Saturday");
  const [weatherResolved, setWeatherResolved] = useState<{ action: string; note: string } | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [luma, setLuma] = useState<LumaEvent | null>(null);
  const [lumaCreating, setLumaCreating] = useState(false);
  const [lumaModal, setLumaModal] = useState(false);
  const [lumaConnected, setLumaConnected] = useState(false);
  useEffect(() => { setLumaConnected(!!getLumaKey()); }, []);

  // For an event-mode launch with Luma connected, spin up the real event page.
  async function createLumaEvent(p: Plan, weekday: string) {
    if (!getLumaKey() || !isEventLocation(location)) return;
    setLumaCreating(true);
    try {
      const r = await fetch("/api/luma", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-luma-key": getLumaKey() },
        body: JSON.stringify({ goal, cta, website, location, eventWeekday: weekday, brand: p.brand }),
      });
      const d = await r.json();
      if (d.url || d.id) {
        const ev: LumaEvent = d;
        setLuma(ev);
        const next = { ...p, luma: ev }; setPlan(next); savePlanLocal(next);
      }
    } catch { /* non-fatal: the week still ships without a Luma page */ }
    setLumaCreating(false);
  }

  // Cache a finished launch keyed by its inputs so the same brief is instant for
  // anyone next time. Called after generation and after media renders, so the
  // cached plan carries the rendered media URLs too. Best-effort, needs sign-in.
  async function cachePlan(p: any, sc?: any) {
    if (!p?.inputs?.goal) return;
    try {
      await fetch("/api/cache", {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ inputs: p.inputs, plan: p, scorecard: sc ?? scorecard }),
      });
    } catch { /* best-effort */ }
  }

  async function runGenerate(weekday = eventWeekday) {
    if (!goal.trim()) { setErr("Tell the crew what you're trying to accomplish first."); return; }
    setErr(""); setLoading(true); setPlan(null); setScorecard(null);
    setWeatherResolved(null); setLuma(null);
    try {
      const r = await fetch("/api/generate-week", {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()), ...keyHeaders() },
        body: JSON.stringify({ goal, cta, website, location, eventWeekday: weekday, renderMedia: reviewMedia }),
      });
      const d = await r.json();
      // Cached briefs come back instantly with no auth; a novel brief 401s ->
      // prompt sign-in.
      if (r.status === 401) {
        setErr("Create a free account to generate your launch week.");
        if (typeof window !== "undefined") window.dispatchEvent(new Event("lc:open-auth"));
        setLoading(false); return;
      }
      if (!r.ok) throw new Error(d.error || "launch sequence failed");
      setPlan(d.plan); setScorecard(d.scorecard);
      savePlanLocal(d.plan); // flow the live week into /calendar + /channels
      if (!d.cached) cachePlan(d.plan, d.scorecard); // remember this brief for instant replays
      createLumaEvent(d.plan, weekday); // fire-and-fill; non-blocking
    } catch (e: any) { setErr(String(e.message || e)); }
    setLoading(false);
  }
  const generate = () => runGenerate();

  // Weather decisions for the event day.
  function rainPlan() {
    if (!plan?.weather) return;
    const note = plan.weather.rainPlanNote || "Rain or shine. Bring a layer, we will have cover.";
    const next = structuredClone(plan);
    const ev = next.days.find((d) => d.isEventDay);
    if (ev) ev.weatherNote = note;
    setPlan(next); savePlanLocal(next);
    setWeatherResolved({ action: "rain_plan", note: `Rain plan added for ${plan.weather.weekday}: "${note}"` });
  }
  function proceedAnyway() {
    if (!plan?.weather) return;
    setWeatherResolved({ action: "proceed", note: `Posting ${plan.weather.weekday} as planned. We will keep watching the forecast.` });
  }
  async function reschedule() {
    const alt = plan?.weather?.altDay;
    if (!alt) return;
    setRescheduling(true);
    setEventWeekday(alt.weekday);
    await runGenerate(alt.weekday);
    setRescheduling(false);
    setWeatherResolved({ action: "reschedule", note: `Moved the event to ${alt.weekday}. ${alt.condition}, ${alt.precipProb}% rain. The week was re-planned around it.` });
  }

  function loadSample() {
    setErr(""); setPlan(SAMPLE_PLAN); setScorecard(SAMPLE_SCORE);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Deep link + sidebar wiring. /?demo=1 (or #sample) opens a finished week.
  // Recent-mission clicks (sidebar) drop the mission in via sessionStorage +
  // an "lc:mission" event; "New launch" resets everything via "lc:new".
  useEffect(() => {
    if (typeof window === "undefined") return;
    const applyPending = () => {
      const raw = sessionStorage.getItem("lc:mission");
      if (!raw) return;
      try {
        const m = JSON.parse(raw);
        setPlan(null); setScorecard(null); setErr("");
        setGoal(m.goal || ""); setCta(m.cta || ""); setWebsite(m.website || ""); setLocation(m.location || "");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {}
      sessionStorage.removeItem("lc:mission");
    };
    const reset = () => { setPlan(null); setScorecard(null); setErr(""); setGoal(""); setCta(""); setWebsite(""); setLocation(""); };
    const p = new URLSearchParams(window.location.search);
    if (p.get("demo") === "1" || window.location.hash === "#sample") { setPlan(SAMPLE_PLAN); setScorecard(SAMPLE_SCORE); }
    applyPending();
    window.addEventListener("lc:mission", applyPending);
    window.addEventListener("lc:new", reset);
    return () => { window.removeEventListener("lc:mission", applyPending); window.removeEventListener("lc:new", reset); };
  }, []);

  async function makeMedia(di: number, si: number) {
    if (!plan) return;
    const slot = plan.days[di].slots[si];
    const id = `${di}:${si}`;
    setMediaBusy(id); setErr("");
    try {
      const r = await fetch("/api/generate-media", {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()), ...falHeader() },
        body: JSON.stringify({ contentType: slot.contentType, prompt: slot.mediaPrompt || slot.copy,
          brandColors: plan.brand?.colors, location: plan.inputs?.location || location,
          org: plan.brand?.name, day: plan.days[di].weekday, platform: slot.platform,
          brand: plan.brand?.name, caption: (slot.copy || "").slice(0, 120), intent: slot.reaction }),
      });
      const d = await r.json();
      if (r.status === 402) { setErr(d.error || "Free media limit reached."); if (typeof window !== "undefined") window.dispatchEvent(new Event("lc:open-fal-key")); setMediaBusy(null); return; }
      if (d.url) {
        const next = structuredClone(plan);
        next.days[di].slots[si].mediaUrl = d.url;
        setPlan(next);
        savePlanLocal(next); // keep calendar/channels in sync with rendered media
        cachePlan(next); // update the cached brief with the rendered media
        const { saveAsset } = await import("@/lib/assets-store");
        saveAsset({ url: d.url, contentType: slot.contentType, platform: slot.platform,
          day: plan.days[di].weekday, brand: plan.brand?.name || "", caption: slot.copy.slice(0, 120) });
      } else setErr(d.error || "render failed");
    } catch (e: any) { setErr(String(e.message || e)); }
    setMediaBusy(null);
  }

  const eventIndex = plan ? plan.days.findIndex((d) => d.isEventDay) : -1;
  const isVid = (t: string) => t === "ugc_video" || t === "motion_video";

  return (
    <main style={{ position: "relative", maxWidth: 820, margin: "0 auto", padding: "0 24px 120px" }}>
      <AuthBar plan={plan} onLoadProject={(p: any) => { setPlan(p); setScorecard(scoreOf(p)); savePlanLocal(p); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      <FalKeyModal />
      {loading && <LaunchSequence goal={goal} website={website} />}

      {/* ── hero + composer ─────────────────────────────────────────────── */}
      {!plan && (
        <section style={{ minHeight: "calc(100vh - 40px)", display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: 40, paddingBottom: 60 }}>
          <div className="rise" style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 18, animation: "drift 6s ease-in-out infinite" }}>
              <Mark size={38} />
            </div>
            <h1 className="serif" style={{ fontSize: "clamp(32px, 4.4vw, 50px)", fontWeight: 400, letterSpacing: "-0.015em", color: "var(--ink)", margin: 0, lineHeight: 1.08 }}>
              Let&apos;s launch your week.
            </h1>
            <p style={{ maxWidth: 500, margin: "16px auto 0", color: "var(--muted)", fontSize: 16, lineHeight: 1.6 }}>
              Tell the crew your goal. A team of Claude agents plans seven days of content,
              writes it on-brand, and grades its own work before anything ships.
            </p>
          </div>

          {/* composer — liquid glass */}
          <div className="rise" style={{ animationDelay: "80ms" }}>
            <div className="lg lg--refract" style={{ borderRadius: 24, padding: "6px 6px 0" }}>
              <textarea
                value={goal} onChange={(e) => setGoal(e.target.value)}
                onFocus={() => setGoalFocused(true)} onBlur={() => setGoalFocused(false)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate(); }}
                placeholder={typed ? `Try: ${typed}` : "What are you trying to accomplish?"}
                rows={2}
                style={{
                  width: "100%", resize: "none", background: "transparent", border: 0,
                  padding: "14px 14px 6px", color: "var(--ink)", fontSize: 17, lineHeight: 1.5,
                }}
              />
              {/* secondary inputs */}
              <div style={{ display: "flex", gap: 8, padding: "0 12px 4px", flexWrap: "wrap" }}>
                <GhostInput icon={<PlatformGlyph p="x" size={12} />} value={cta} onChange={setCta} placeholder="Call to action" />
                <GhostInput
                  icon={<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/></svg>}
                  value={website} onChange={setWebsite} placeholder="Website" />
                <GhostInput
                  icon={<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>}
                  value={location} onChange={setLocation} placeholder="Location (NA if online)" />
              </div>
              {/* toolbar */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px 10px" }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)",
                  border: "1px solid var(--border)", borderRadius: 8, padding: "5px 9px",
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: "var(--clay)", transform: "rotate(45deg)" }} />
                  Opus 4.8
                </span>
                <span style={{ fontSize: 12.5, color: "var(--faint)" }}>Strategist &amp; critic</span>
                <button type="button" onClick={() => setReviewMedia((v) => !v)} aria-pressed={reviewMedia}
                  title="Also render each media slot's still and grade it with the visual critic (uses your fal key; the critic re-renders failures)"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer",
                    color: reviewMedia ? "var(--clay-deep)" : "var(--muted)",
                    border: `1px solid ${reviewMedia ? "var(--clay)" : "var(--border)"}`,
                    borderRadius: 8, padding: "5px 9px", background: reviewMedia ? "var(--clay-bg)" : "transparent",
                  }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: reviewMedia ? "var(--go)" : "var(--border-strong)" }} />
                  Review media
                </button>
                <button onClick={() => setLumaModal(true)} title={lumaConnected ? "Luma connected" : "Connect Luma to auto-create an event"} style={{
                  display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer",
                  color: lumaConnected ? "var(--go)" : "var(--muted)", background: "transparent",
                  border: "1px solid var(--border)", borderRadius: 8, padding: "4px 9px",
                }}>
                  <LumaMark size={15} radius={4} />
                  {lumaConnected ? "Luma connected" : "Connect Luma"}
                  {lumaConnected && <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--go)" }} />}
                </button>
                <button onClick={generate} disabled={loading} aria-label="Launch" style={{
                  marginLeft: "auto", width: 38, height: 38, borderRadius: 11, border: 0,
                  cursor: loading ? "default" : "pointer",
                  background: loading ? "var(--border-strong)" : "var(--clay)", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background .15s ease, transform .12s ease",
                }}
                  onMouseDown={(e) => !loading && (e.currentTarget.style.transform = "scale(0.94)")}
                  onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}>
                  {loading
                    ? <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} style={{ animation: "spin360 0.9s linear infinite" }}><path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round"/></svg>
                    : <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>}
                </button>
              </div>
            </div>

            {/* example missions */}
            <div style={{ display: "flex", gap: 9, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
              {EXAMPLES.map((ex) => (
                <button key={ex.label} onClick={() => { setGoal(ex.goal); setCta(ex.cta); setWebsite(ex.website); setLocation(ex.location || ""); setErr(""); }}
                  className="glass-btn" style={{
                    display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13.5, color: "var(--text)",
                    borderRadius: 11, padding: "8px 14px",
                  }}>
                  <span style={{ color: "var(--clay-deep)", display: "flex" }}><Ic name="bolt" size={14} /></span>
                  {ex.label}
                </button>
              ))}
              <button onClick={loadSample} className="glass-btn" style={{
                display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13.5, color: "var(--clay-deep)",
                fontWeight: 600, borderRadius: 11, padding: "8px 14px",
              }}>
                <Ic name="play" size={13} /> Watch a finished sample <Ic name="arrowRight" size={14} />
              </button>
            </div>
            {err && <p style={{ textAlign: "center", color: "var(--abort)", marginTop: 16, fontSize: 13.5 }}>{err}</p>}
          </div>

          {/* how it works */}
          <div className="rise" style={{ animationDelay: "160ms", marginTop: 64, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
            {[
              { ic: "target", t: "Plot the arc", d: "The strategist reads your site and lays seven days of themes that build to the event." },
              { ic: "pen", t: "Draft on-brand", d: "Channel writers draft every X, LinkedIn, and Instagram post in your real voice." },
              { ic: "check", t: "Grade before launch", d: "The critic scores each draft, rewrites the misses, and clears the week to go." },
            ].map((s, i) => (
              <div key={s.t} className="lg" style={{ borderRadius: 16, padding: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                  <span style={{
                    width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(217,119,87,0.13)", color: "var(--clay-deep)", flex: "0 0 auto",
                  }}><Ic name={s.ic} size={16} /></span>
                  <span className="serif" style={{ fontSize: 13, fontStyle: "italic", color: "var(--faint)" }}>{`0${i + 1}`}</span>
                </div>
                <div style={{ fontSize: 15.5, fontWeight: 600, color: "var(--ink)", marginBottom: 5 }}>{s.t}</div>
                <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>{s.d}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── results ────────────────────────────────────────────────────── */}
      {plan && scorecard && (
        <div style={{ paddingTop: 40 }}>
          <ReadinessBoard plan={plan} scorecard={scorecard} onReset={() => { setPlan(null); setScorecard(null); }} />
          <PublishBar plan={plan as any} keyHeader={keyHeaders()}
            onPlanChange={(p: any) => { setPlan(p); savePlanLocal(p); cachePlan(p); }} />
          {(lumaCreating || luma) && <LumaEventCard luma={luma} creating={lumaCreating} />}
          {plan.weather?.isBad && (
            <WeatherWatchCard weather={plan.weather} resolution={weatherResolved} busy={rescheduling}
              onReschedule={reschedule} onRainPlan={rainPlan} onProceed={proceedAnyway} />
          )}
          {err && <p style={{ color: "var(--abort)", margin: "0 0 18px", fontSize: 13 }}>{err}</p>}
          <div style={{ display: "grid", gap: 14 }}>
            {plan.days.map((day, di) => (
              <DayCard key={day.day} day={day} di={di} eventIndex={eventIndex}
                mediaBusy={mediaBusy} onMakeMedia={makeMedia} isVid={isVid} />
            ))}
          </div>
        </div>
      )}

      <LumaConnectModal open={lumaModal} onClose={() => setLumaModal(false)}
        onConnected={(k) => { setLumaKey(k); setLumaConnected(true); }} />
    </main>
  );
}

// ─── pieces ───────────────────────────────────────────────────────────────────

function GhostInput({ icon, value, onChange, placeholder }:
  { icon: React.ReactNode; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 7, flex: "1 1 200px",
      border: "1px solid var(--border)", borderRadius: 9, padding: "7px 10px", background: "var(--bg)",
    }}>
      <span style={{ color: "var(--faint)", display: "flex", flex: "0 0 auto" }}>{icon}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", background: "transparent", border: 0, color: "var(--ink)", fontSize: 13.5 }} />
    </span>
  );
}

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
        s.i++; setOut(full.slice(0, s.i));
        if (s.i >= full.length) { s.del = true; timer = setTimeout(tick, 1700); return; }
        timer = setTimeout(tick, 42 + Math.random() * 40);
      } else {
        s.i--; setOut(full.slice(0, Math.max(0, s.i)));
        if (s.i <= 0) { s.del = false; s.p++; timer = setTimeout(tick, 340); return; }
        timer = setTimeout(tick, 18);
      }
    };
    timer = setTimeout(tick, 300);
    return () => clearTimeout(timer);
  }, [active, phrases]);
  return active ? out : "";
}

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
  const mediaAllGo = scorecard.mediaTotal == null || scorecard.mediaPassing === scorecard.mediaTotal;
  const allGo = scorecard.passing === scorecard.total && mediaAllGo;
  const goCount = useCountUp(scorecard.passing);
  return (
    <section className="rise lg lg-strong" style={{
      marginBottom: 22, borderRadius: 18, padding: "22px 24px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 10 }}>Launch readiness · {plan.brand?.name || "Mission"}</p>
          <h2 className="serif" style={{
            fontSize: 36, fontWeight: 400, letterSpacing: "-0.02em", margin: 0, lineHeight: 1,
            color: allGo ? "var(--go)" : "var(--ink)",
          }}>
            {allGo ? "All systems go" : `${goCount} of ${scorecard.total} ready`}
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 10 }}>
            {scorecard.total} posts graded · {scorecard.fixed} auto-corrected by the critic before launch
          </p>
          {scorecard.mediaTotal != null && scorecard.mediaTotal > 0 && (
            <p style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 4 }}>
              {scorecard.mediaPassing} of {scorecard.mediaTotal} media renders cleared the visual critic
              <span style={{ color: "var(--faint)" }}> · matches intent, clean, on-brand</span>
            </p>
          )}
        </div>
        <button onClick={onReset} style={{
          background: "var(--card)", border: "1px solid var(--border-strong)", color: "var(--text)",
          borderRadius: 10, padding: "9px 15px", fontSize: 13.5, fontWeight: 500, cursor: "pointer",
        }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-2)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--card)")}>New launch</button>
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 18 }}>
        {plan.days.flatMap((d) => d.slots).map((s, i) => (
          <div key={i} title={s.grade?.pass ? "Go" : (s.grade?.failures.join(", ") || "")} style={{
            flex: 1, height: 6, borderRadius: 3,
            background: s.grade?.pass ? "var(--go)" : "var(--abort)",
          }} />
        ))}
      </div>
    </section>
  );
}

function tminus(eventIndex: number, di: number): { label: string; event: boolean } {
  if (eventIndex < 0) return { label: `Day ${di + 1}`, event: false };
  const off = eventIndex - di;
  if (off === 0) return { label: "Launch day", event: true };
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
      animationDelay: `${di * 45}ms`,
      border: `1px solid ${t.event ? "var(--clay)" : "var(--border)"}`,
      borderRadius: 14, background: t.event ? "var(--clay-bg)" : "var(--card)", overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 18px", borderBottom: `1px solid ${t.event ? "rgba(189,93,58,0.2)" : "var(--border)"}` }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: t.event ? "var(--clay-deep)" : "var(--faint)", minWidth: 64 }}>{t.label}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{day.weekday}</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>{day.theme}</div>
        </div>
        <div style={{ textAlign: "right", maxWidth: "52%" }}>
          <span className="eyebrow" style={{ fontSize: 10.5 }}>Today&apos;s CTA</span>
          <div style={{ fontSize: 13, color: "var(--clay-deep)", lineHeight: 1.35, marginTop: 2 }}>{day.cta}</div>
        </div>
      </div>
      {day.weatherNote && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", background: "rgba(189,93,58,0.08)", borderBottom: "1px solid rgba(189,93,58,0.2)", fontSize: 12.5, color: "var(--clay-deep)" }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M7 17a4 4 0 010-8 5 5 0 019.6-1.3A3.5 3.5 0 0117 17H7z"/><path d="M8 20l-1 2M12 20l-1 2M16 20l-1 2"/></svg>
          <span><strong style={{ fontWeight: 600 }}>Rain plan:</strong> {day.weatherNote}</span>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 1, background: "var(--border)" }}>
        {day.slots.map((slot, si) => (
          <SlotCard key={si} slot={slot} busy={mediaBusy === `${di}:${si}`}
            onRender={() => onMakeMedia(di, si)} isVid={isVid} eventBg={t.event} />
        ))}
      </div>
    </div>
  );
}

function SlotCard({ slot, busy, onRender, isVid, eventBg }:
  { slot: Slot; busy: boolean; onRender: () => void; isVid: (t: string) => boolean; eventBg: boolean }) {
  const go = slot.grade?.pass;
  return (
    <div style={{ background: eventBg ? "var(--clay-bg)" : "var(--card)", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--ink)" }}>
          <PlatformGlyph p={slot.platform} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{PLATFORM_LABEL[slot.platform] || slot.platform}</span>
        </span>
        <span style={{
          fontSize: 11, color: "var(--muted)", border: "1px solid var(--border-strong)",
          borderRadius: 6, padding: "2px 8px",
        }}>{TYPE_LABEL[slot.contentType] || slot.contentType}</span>
      </div>

      <p className="serif" style={{ fontSize: 13.5, fontStyle: "italic", color: "var(--muted)", margin: "0 0 9px", lineHeight: 1.4 }}>
        {slot.reaction}
      </p>

      <p style={{ fontSize: 14.5, lineHeight: 1.55, whiteSpace: "pre-wrap", margin: 0, color: "var(--ink)" }}>{slot.copy}</p>

      {slot.mediaUrl && (isVid(slot.contentType)
        ? <video src={slot.mediaUrl} controls playsInline style={{ width: "100%", borderRadius: 10, marginTop: 12 }} />
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={slot.mediaUrl} alt="" style={{ width: "100%", borderRadius: 10, marginTop: 12 }} />)}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 13 }}>
        {(slot.grade || slot.visualGrade) && (
          <span style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {slot.grade && (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: go ? "var(--go)" : "var(--abort)" }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: "currentColor" }} />
                {go ? "Go" : `No-go · ${slot.grade.failures.slice(0, 2).join(", ")}`}
              </span>
            )}
            {slot.visualGrade && (
              <span title={slot.visualGrade.notes || (slot.visualGrade.issues || []).join("; ")}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: slot.visualGrade.pass ? "var(--go)" : "var(--abort)" }}>
                <span style={{ width: 6, height: 6, background: "currentColor", transform: "rotate(45deg)" }} />
                {slot.visualGrade.pass ? "Visual: clear" : `Visual: ${(slot.visualGrade.issues || [])[0] || "flagged"}`}
              </span>
            )}
          </span>
        )}
        {(slot.contentType === "image" || isVid(slot.contentType)) && !slot.mediaUrl && (
          <button onClick={onRender} disabled={busy} style={{
            fontSize: 12.5, cursor: busy ? "default" : "pointer",
            background: "transparent", color: busy ? "var(--faint)" : "var(--clay-deep)",
            border: `1px solid ${busy ? "var(--border)" : "var(--border-strong)"}`, borderRadius: 8, padding: "6px 12px",
          }}>
            {busy ? "Rendering…" : `Render ${TYPE_LABEL[slot.contentType].toLowerCase()}`}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── the launch sequence: a calm working overlay while the swarm runs ──────────
const SEQ_PHASES = ["Acquire", "Plot arc", "Draft", "Grade", "Correct", "Finalize"];

function LaunchSequence({ goal, website }: { goal: string; website: string }) {
  const host = (() => { try { return new URL(website.startsWith("http") ? website : `https://${website}`).host; } catch { return website || "your site"; } })();
  const SCRIPT = useRef([
    `Reading the brief and visiting ${host}`,
    `Objective locked: "${goal.slice(0, 48)}${goal.length > 48 ? "…" : ""}"`,
    "Strategist is plotting the 7-day arc to the event",
    "Writers drafting X, LinkedIn, and Instagram in parallel",
    "Critic is scanning every draft for AI-tells and fabrication",
    "Critic flagged a hype phrase on day 3 — rewriting it",
    "Re-grade complete, that post is now a go",
    "Compiling launch readiness…",
  ]).current;

  const [phase, setPhase] = useState(0);
  const [lines, setLines] = useState<string[]>([]);
  const [pct, setPct] = useState(8);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ph = setInterval(() => setPhase((p) => Math.min(p + 1, SEQ_PHASES.length - 1)), 1600);
    let i = 0;
    const lg = setInterval(() => { if (i < SCRIPT.length) { setLines((l) => [...l, SCRIPT[i]]); i++; } }, 760);
    const ch = setInterval(() => setPct((p) => p + (94 - p) * 0.07), 150);
    return () => { clearInterval(ph); clearInterval(lg); clearInterval(ch); };
  }, [SCRIPT]);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e6 }); }, [lines]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50, animation: "fadein 0.25s ease both",
      background: "rgba(250,249,245,0.72)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div className="lg lg-strong" style={{
        width: "min(560px, 94vw)", borderRadius: 22,
        padding: 28, position: "relative", overflow: "hidden",
      }}>
        <span style={{ position: "absolute", top: 0, width: "30%", height: 2, background: "linear-gradient(90deg, transparent, var(--clay), transparent)", animation: "sweep 2.6s linear infinite" }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Mark size={20} />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--clay-deep)" }}>The crew is working</span>
          </span>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{Math.round(pct)}%</span>
        </div>

        <h2 className="serif" style={{ fontSize: 26, fontWeight: 400, letterSpacing: "-0.015em", margin: "0 0 6px", color: "var(--ink)" }}>
          Building your launch week.
        </h2>
        <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 20px" }}>
          Plan, draft, grade, correct. Nothing ships until the critic says go.
        </p>

        <div style={{ height: 7, borderRadius: 99, background: "var(--bg-2)", overflow: "hidden", marginBottom: 20 }}>
          <div style={{
            width: `${pct}%`, height: "100%", borderRadius: 99,
            background: "linear-gradient(90deg, var(--clay), #e6a085, var(--clay))",
            backgroundSize: "200% 100%", animation: "charge 1.6s linear infinite", transition: "width 0.2s ease",
          }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: `repeat(${SEQ_PHASES.length}, 1fr)`, gap: 6, marginBottom: 20 }}>
          {SEQ_PHASES.map((ph, i) => {
            const done = i < phase, active = i === phase;
            return (
              <div key={ph} style={{ textAlign: "center" }}>
                <div style={{
                  height: 3, borderRadius: 2, marginBottom: 7,
                  background: done ? "var(--go)" : active ? "var(--clay)" : "var(--border-strong)",
                  animation: active ? "softpulse 1.1s ease-in-out infinite" : "none",
                }} />
                <span style={{ fontSize: 10, color: done ? "var(--go)" : active ? "var(--ink)" : "var(--faint)" }}>{ph}</span>
              </div>
            );
          })}
        </div>

        <div ref={logRef} style={{
          height: 120, overflow: "hidden", background: "var(--bg-2)", border: "1px solid var(--border)",
          borderRadius: 12, padding: "11px 14px",
        }}>
          {lines.map((l, i) => (
            <div key={i} style={{
              fontSize: 12.5, lineHeight: 1.75, color: i === lines.length - 1 ? "var(--clay-deep)" : "var(--muted)",
              animation: "logline 0.25s ease both",
            }}>
              <span style={{ color: "var(--clay)" }}>›</span> {l}
            </div>
          ))}
          <span style={{ fontSize: 12.5, color: "var(--clay)", animation: "blink 1s steps(1) infinite" }}>▋</span>
        </div>
      </div>
    </div>
  );
}

// ─── baked-in sample week — full payoff with no API key ─────────────────────────
const g = (failures: string[] = []) => ({ pass: true, failures });
const vg = (over: Partial<VisualGrade> = {}): VisualGrade => ({ pass: true, matchesIntent: true, onBrand: true, clean: true, issues: [], notes: "On-brand, clean, on-intent.", ...over });
const SAMPLE_PLAN: Plan = {
  brand: {
    name: "Surfrider Foundation",
    voice: "Plainspoken, urgent, a little salty. No corporate gloss.",
    summary: "A grassroots coastal-conservation nonprofit rallying volunteers for a Saturday beach cleanup.",
    colors: ["#0a6cff", "#08c", "#0c2"],
  },
  inputs: { goal: "Get 50 volunteers to our Saturday beach cleanup", cta: "Come to the cleanup, 9am at the north lot", website: "https://www.surfrider.org", eventWeekday: "Saturday", location: "Ocean Beach, San Francisco, CA" },
  weather: {
    location: "San Francisco, California, US", eventDate: "2026-06-20", weekday: "Saturday",
    condition: "Rain showers", precipProb: 70, tempMaxC: 14, windMaxKmh: 34,
    isBad: true, severe: false,
    summary: "Rain showers expected on Saturday (70% rain, ~57°F, wind 34 km/h).",
    recommendation: "rain_plan",
    rainPlanNote: "Rain or shine. Bring a poncho, we will have cover and hot coffee.",
    altDay: { weekday: "Sunday", date: "2026-06-21", condition: "Mostly clear", precipProb: 10 },
  },
  days: [
    { day: 1, weekday: "Monday", theme: "Sound the alarm", cta: "Save the date: Saturday, 9am, Ocean Beach", isEventDay: false, slots: [
      { platform: "x", contentType: "text", reaction: "A number that stops the scroll", copy: "Two tons of plastic came off Ocean Beach last spring. Saturday we go back for the rest. 9am, north lot. Bring a friend.", grade: g() },
      { platform: "instagram", contentType: "image", reaction: "Makes you feel the stakes", copy: "What one tide leaves behind.", mediaPrompt: "documentary photo of plastic debris on a foggy California beach at dawn, muted tones", grade: g(), visualGrade: vg() },
    ] },
    { day: 2, weekday: "Tuesday", theme: "Why it matters", cta: "Tag someone who would show up", isEventDay: false, slots: [
      { platform: "linkedin", contentType: "text", reaction: "Reframes a cleanup as the best team ritual", copy: "We give the team one Saturday a month on the sand. It is the only standup where nobody checks their phone. Here is why we keep doing it.", grade: g(["softened a humblebrag"]) },
    ] },
    { day: 3, weekday: "Wednesday", theme: "Proof it works", cta: "Reserve your spot at the link", isEventDay: false, slots: [
      { platform: "x", contentType: "text", reaction: "Turns proof into a dare", copy: "80 volunteers. 3 hours. 1,900 pounds of trash. That was March. April is on you.", grade: g() },
      { platform: "instagram", contentType: "image", reaction: "The before-and-after gut-punch", copy: "Same 200 yards of coast. Left: 8am. Right: 11am. That is what showing up looks like.", mediaPrompt: "split before-and-after of a littered vs clean beach cove, natural light", grade: g(), visualGrade: vg({ notes: "Cleared on revision 1 — the first render had garbled signage text; the visual critic caught it and re-rendered." }) },
    ] },
    { day: 4, weekday: "Thursday", theme: "Meet the crew", cta: "Sponsor a cleanup (link in bio)", isEventDay: false, slots: [
      { platform: "instagram", contentType: "ugc_video", reaction: "A face you trust, not a brand", copy: "60 seconds with Dana, who has not missed a cleanup in four years. Ask her why.", mediaPrompt: "handheld vertical interview of a volunteer on a beach, candid, golden hour", grade: g(["cut a cliché opener"]), visualGrade: vg() },
      { platform: "linkedin", contentType: "text", reaction: "Gives a sponsor their business case", copy: "Three reasons your company should sponsor a beach cleanup. The third one is recruiting, and it is the one your CFO will care about.", grade: g() },
    ] },
    { day: 5, weekday: "Friday", theme: "Last call", cta: "RSVP for tomorrow", isEventDay: false, slots: [
      { platform: "x", contentType: "text", reaction: "Removes every reason not to come", copy: "Tomorrow. 9am. Ocean Beach, north lot. Gloves and bags are on us. Just show up.", grade: g() },
    ] },
    { day: 6, weekday: "Saturday", theme: "Launch day", cta: "Pull up. North lot, 9am.", isEventDay: true, slots: [
      { platform: "instagram", contentType: "motion_video", reaction: "The hero film, full volume", copy: "Today is the day. Pull up.", mediaPrompt: "energetic launch-day montage of volunteers arriving at a beach, banners, sunrise", grade: g(), visualGrade: vg() },
      { platform: "x", contentType: "text", reaction: "Live energy, come now", copy: "Live from Ocean Beach. The crew is here, the coffee is hot, and the coast needs you. Park at the north lot.", grade: g() },
    ] },
    { day: 7, weekday: "Sunday", theme: "The payoff", cta: "Join the next one at the link", isEventDay: false, slots: [
      { platform: "instagram", contentType: "image", reaction: "The payoff that earns the next ask", copy: "Yesterday, 112 of you showed up. This is what you did.", mediaPrompt: "wide shot of a clean beach and a large group of smiling volunteers holding bags", grade: g(), visualGrade: vg() },
      { platform: "linkedin", contentType: "text", reaction: "Gratitude that sets up what is next", copy: "112 people. 2,400 pounds. One clean coastline. Thank you. The next cleanup is the second Saturday of May, and we are already short on gloves.", grade: g() },
    ] },
  ],
};
const SAMPLE_SCORE: Scorecard = { total: 12, passing: 12, fixed: 3, mediaPassing: 5, mediaTotal: 5 };
