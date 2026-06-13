"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Mark, Ic } from "../icons";

// Reveal a string character-by-character. Spaces become nbsp so width is kept.
function Chars({ text, base, step = 0.028 }: { text: string; base: number; step?: number }) {
  return (
    <>
      {Array.from(text).map((ch, i) => (
        <span key={i} className="lz-char" style={{ animationDelay: `${base + i * step}s` }}>
          {ch === " " ? " " : ch}
        </span>
      ))}
    </>
  );
}

const NAV = [
  { label: "Overview", href: "#" },
  { label: "How it works", href: "#how" },
  { label: "The crew", href: "#", badge: "6" },
];
const SIDE = ["Overview", "The crew", "How it works", "Console"];

export default function Landing() {
  useEffect(() => { document.title = "Launch Control — a Paradigm Outreach project"; }, []);

  return (
    <div className="lz">
      {/* alive background */}
      <div className="lz-field" aria-hidden>
        <span className="lz-cone" />
        <span className="lz-blob b1" /><span className="lz-blob b2" /><span className="lz-blob b3" /><span className="lz-blob b4" />
      </div>
      <div className="lz-grain" aria-hidden />
      <div className="lz-vign" aria-hidden />
      <div className="lz-blur" aria-hidden><i /><i /><i /><i /><i /><i /></div>

      {/* right section nav */}
      <nav className="lz-side lz-up" style={{ animationDelay: "1.1s" }} aria-label="Sections">
        {SIDE.map((s, i) => (
          <Link key={s} href={s === "Console" ? "/" : "#"} className={i === 0 ? "on" : ""}>
            {s} <span className="bar" />
          </Link>
        ))}
      </nav>

      <main className="lz-main">
        {/* header */}
        <header className="lz-head lz-up" style={{ animationDelay: "0.05s" }}>
          <div className="lz-brand">
            <Mark size={26} /> Launch&nbsp;Control
            <span style={{ fontSize: 12.5, fontWeight: 500, color: "rgba(255,255,255,0.5)", marginLeft: 4, borderLeft: "1px solid rgba(255,255,255,0.2)", paddingLeft: 10 }}>by Paradigm</span>
          </div>
          <nav className="lz-pill" aria-label="Primary">
            {NAV.map((n) => (
              <a key={n.label} href={n.href}>{n.label}{n.badge && <span className="lz-badge">{n.badge}</span>}</a>
            ))}
          </nav>
          <Link href="/" className="lz-cta">Open the console <Ic name="arrowRight" size={15} /></Link>
        </header>

        {/* hero */}
        <section className="lz-hero">
          <span className="lz-eyebrow lz-glass lz-up" style={{ animationDelay: "0.15s" }}>
            <span className="dot" /> Launch Control · a Paradigm project
          </span>
          <h1 className="lz-h1">
            <span className="lz-line"><Chars text="A whole week of launch," base={0.25} /></span>
            <span className="lz-line accent"><Chars text="written, filmed, and graded" base={0.7} /></span>
            <span className="lz-line"><Chars text="by a swarm of Claude agents." base={1.2} /></span>
          </h1>
        </section>

        {/* bottom */}
        <div className="lz-bottom">
          <div>
            <div className="lz-label lz-up" style={{ animationDelay: "1.5s" }}>01 — The mission</div>
            <p className="lz-desc lz-up" style={{ animationDelay: "1.6s" }}>
              Give Launch Control one sentence. A crew of Claude agents plans seven days of
              content, writes it on-brand, films it, and grades its own work before a single
              post goes out.
            </p>
            <div className="lz-actions lz-up" style={{ animationDelay: "1.72s" }}>
              <Link href="/" className="lz-primary">Start a launch <Ic name="arrowUp" size={16} /></Link>
              <button className="lz-scroll" onClick={() => window.scrollBy({ top: window.innerHeight, behavior: "smooth" })}>
                Scroll
                <span className="ring">
                  <svg width="8" height="9" viewBox="0 0 8 9" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 1v6.5M1.2 5L4 7.7 6.8 5" /></svg>
                </span>
              </button>
            </div>
          </div>

          <Link href="/?demo=1" className="lz-card lz-glass lz-up" style={{ animationDelay: "1.4s" }}>
            <div className="lz-card-img" style={{ backgroundImage: "url(/launch-week.png)" }} />
            <div className="lz-card-body">
              <div className="lz-card-title">See a finished week</div>
              <div className="lz-card-text">Seven days, every channel, graded all-green by the critic. No API key needed.</div>
              <span className="lz-card-arrow">
                <svg width="60" height="13" viewBox="0 0 77 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M1 6.5H75M75 6.5L70 1.5M75 6.5L70 11.5" /></svg>
              </span>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
