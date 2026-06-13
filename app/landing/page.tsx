"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Mark, Ic, PlatformGlyph } from "../icons";

// Reveal a string character-by-character. Spaces kept.
function Chars({ text, base, step = 0.028 }: { text: string; base: number; step?: number }) {
  return (
    <>
      {Array.from(text).map((ch, i) => (
        <span key={i} className="lz-char" style={{ animationDelay: `${base + i * step}s`, whiteSpace: "pre" }}>{ch}</span>
      ))}
    </>
  );
}

const NAV = [
  { label: "How it works", href: "#how" },
  { label: "The crew", href: "#how", badge: "6" },
  { label: "Console", href: "/" },
];

// ── light component replicas (mirror the real app, shown in dark frames) ──
function ComposerRep() {
  return (
    <div className="rep-card">
      <div className="rep-mission">Get 50 volunteers to our Saturday beach cleanup</div>
      <div className="rep-row">
        <span className="rep-chip"><PlatformGlyph p="x" size={12} /> Sign up at the link to join</span>
        <span className="rep-chip"><Ic name="target" size={12} /> surfrider.org</span>
      </div>
      <div className="rep-tool">
        <span className="rep-pill"><span style={{ width: 7, height: 7, borderRadius: 2, background: "var(--clay)", transform: "rotate(45deg)" }} /> Opus 4.8</span>
        <span style={{ fontSize: 12, color: "var(--faint)" }}>Strategist &amp; critic</span>
        <span className="rep-send"><Ic name="arrowUp" size={16} /></span>
      </div>
    </div>
  );
}
function SequenceRep() {
  return (
    <div className="rep-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, color: "var(--clay-deep)" }}><Mark size={16} /> The crew is working</span>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>82%</span>
      </div>
      <div className="rep-charge"><i /></div>
      <div className="rep-phase"><i className="done" /><i className="done" /><i className="done" /><i className="now" /><i /><i /></div>
      <div className="rep-log">
        <div><span className="o">›</span> Strategist is plotting the 7-day arc</div>
        <div><span className="o">›</span> Writers drafting X · LinkedIn · Instagram</div>
        <div><span className="o">›</span> Critic re-graded day 3 → go</div>
      </div>
    </div>
  );
}
function ReadinessRep() {
  return (
    <div className="rep-card">
      <div className="rep-eyebrow">Launch readiness · Surfrider</div>
      <div className="rep-go">All systems go</div>
      <div className="rep-bar">{Array.from({ length: 12 }).map((_, i) => <i key={i} />)}</div>
      <div className="rep-foot">12 posts graded · 3 auto-corrected by the critic before launch</div>
    </div>
  );
}
function FlightRep() {
  return (
    <div className="rep-day">
      <div className="rep-day-h">
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--clay-deep)" }}>Launch day · Saturday</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Pull up. North lot, 9am.</div>
        </div>
        <span className="rep-eyebrow">T-0</span>
      </div>
      {[
        { p: "instagram", t: "Today is the day. Pull up.", tag: "Launch film" },
        { p: "x", t: "Live from Ocean Beach. The crew is here. Where are you?", tag: "Text" },
      ].map((s, i) => (
        <div key={i} className="rep-slot">
          <span style={{ color: "var(--ink)", display: "flex", marginTop: 1 }}><PlatformGlyph p={s.p} size={14} /></span>
          <span style={{ flex: 1 }}>{s.t}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--go)" }}><span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--go)" }} /> Go</span>
        </div>
      ))}
    </div>
  );
}

const PROC = [
  { n: "01", title: "Start with one sentence", desc: "Your goal, your call to action, your website. That is the whole brief. No templates, no blank page.", visual: <ComposerRep />, label: "console · composer" },
  { n: "02", title: "The crew plans and writes", desc: "A strategist maps the seven days that build to your event, then channel writers draft for X, LinkedIn, and Instagram in your voice.", visual: <SequenceRep />, label: "launch sequence" },
  { n: "03", title: "The critic grades it", desc: "Every draft is scored for AI-tells and fabrication, then rewritten until it earns a pass. Nothing moves forward until the week is green.", visual: <ReadinessRep />, label: "readiness board" },
  { n: "04", title: "You approve and schedule", desc: "Stills and film render on demand, then the week posts to your channels on the dates that matter.", visual: <FlightRep />, label: "flight plan" },
];

export default function Landing() {
  useEffect(() => {
    document.title = "Launch Control · a Paradigm Outreach project";
    const els = Array.from(document.querySelectorAll(".reveal"));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.18 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="lz">
      <div className="lz-field" aria-hidden>
        <span className="lz-cone" />
        <span className="lz-blob b1" /><span className="lz-blob b2" /><span className="lz-blob b3" /><span className="lz-blob b4" />
      </div>
      <div className="lz-grain" aria-hidden />
      <div className="lz-vign" aria-hidden />
      <div className="lz-blur" aria-hidden><i /><i /><i /><i /><i /><i /></div>

      <nav className="lz-side lz-up" style={{ animationDelay: "1.1s" }} aria-label="Sections">
        {["Overview", "How it works", "The crew", "Console"].map((s, i) => (
          <Link key={s} href={s === "Console" ? "/" : s === "Overview" ? "#top" : "#how"} className={i === 0 ? "on" : ""}>{s} <span className="bar" /></Link>
        ))}
      </nav>

      <main className="lz-main" id="top">
        <header className="lz-head lz-up" style={{ animationDelay: "0.05s" }}>
          <div className="lz-brand">
            <Mark size={26} /> Launch&nbsp;Control
            <span style={{ fontSize: 12.5, fontWeight: 500, color: "rgba(255,255,255,0.5)", marginLeft: 4, borderLeft: "1px solid rgba(255,255,255,0.2)", paddingLeft: 10 }}>by Paradigm&nbsp;Outreach</span>
          </div>
          <nav className="lz-pill" aria-label="Primary">
            {NAV.map((n) => (
              <a key={n.label} href={n.href}>{n.label}{n.badge && <span className="lz-badge">{n.badge}</span>}</a>
            ))}
          </nav>
          <Link href="/" className="lz-cta">Open the console <Ic name="arrowRight" size={15} /></Link>
        </header>

        <section className="lz-hero">
          <span className="lz-eyebrow lz-glass lz-up" style={{ animationDelay: "0.15s" }}>
            Launch Control · a Paradigm Outreach project
          </span>
          <h1 className="lz-h1">
            <span className="lz-line"><Chars text="A whole week of content," base={0.25} /></span>
            <span className="lz-line accent"><Chars text="written, filmed, and graded," base={0.7} /></span>
            <span className="lz-line"><Chars text="posted across every channel." base={1.25} /></span>
          </h1>
        </section>

        <div className="lz-bottom">
          <div>
            <div className="lz-label lz-up" style={{ animationDelay: "1.5s" }}>How it works</div>
            <p className="lz-desc lz-up" style={{ animationDelay: "1.6s" }}>
              Tell the crew what you are promoting. It researches your brand, maps the days that
              build to your event, drafts and films every post, and grades its own work. All you
              do is approve and schedule.
            </p>
            <div className="lz-actions lz-up" style={{ animationDelay: "1.72s" }}>
              <Link href="/" className="lz-primary">Start a launch <Ic name="arrowUp" size={16} /></Link>
            </div>
          </div>
          <Link href="/?demo=1" className="lz-card lz-glass lz-up" style={{ animationDelay: "1.4s" }}>
            <div className="lz-card-img" style={{ backgroundImage: "url(/launch-week.png)" }} />
            <div className="lz-card-body">
              <div className="lz-card-title">See a finished week</div>
              <div className="lz-card-text">Seven days, every channel, graded all-green by the critic. No API key needed.</div>
              <span className="lz-card-arrow"><svg width="60" height="13" viewBox="0 0 77 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M1 6.5H75M75 6.5L70 1.5M75 6.5L70 11.5" /></svg></span>
            </div>
          </Link>
        </div>

        <button className="lz-scrollcue" onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })} aria-label="Scroll to see how it works">
          <span className="ring"><i /></span>
          Scroll
        </button>
      </main>

      {/* ── scroll story: the real components, how it works ── */}
      <div className="lz-story" id="how">
        {PROC.map((s) => (
          <section key={s.n} className="lz-proc">
            <div className="lz-proc-copy reveal">
              <span className="lz-proc-num">{s.n}</span>
              <h2>{s.title}</h2>
              <p>{s.desc}</p>
            </div>
            <div className="reveal">
              <div className="lz-frame">
                <div className="lz-frame-bar"><span /><span /><span /><span className="lbl">{s.label}</span></div>
                <div className="lz-screen">{s.visual}</div>
              </div>
            </div>
          </section>
        ))}
      </div>

      <section className="lz-final reveal">
        <h2>See your week<br />in minutes.</h2>
        <p className="sub">Give Launch Control one sentence. It brings back seven graded, on-brand days, ready to schedule.</p>
        <div className="lz-final-actions">
          <Link href="/" className="lz-primary">Start a launch <Ic name="arrowUp" size={16} /></Link>
          <Link href="/?demo=1" className="lz-cta">See a finished week <Ic name="arrowRight" size={15} /></Link>
        </div>
      </section>

      <footer className="lz-foot">
        <span style={{ display: "flex", alignItems: "center", gap: 9 }}><Mark size={20} /> Launch Control · a Paradigm Outreach project</span>
        <span>Built with Claude · Opus 4.8</span>
      </footer>
    </div>
  );
}
