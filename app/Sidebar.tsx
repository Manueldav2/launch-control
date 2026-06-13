"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Minimal line icons — no icon dep, keeps the bundle clean and the look bespoke.
function Icon({ d, size = 17 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const NAV = [
  { href: "/", label: "Console", d: "M4 5h16M4 12h16M4 19h10" },
  { href: "/assets", label: "Asset Bay", d: "M3 8l9-5 9 5-9 5-9-5zm0 8l9 5 9-5M3 12l9 5 9-5" },
];

// The swarm, surfaced as a standing roster. Honest: each is a real pipeline step.
const CREW = [
  { role: "Strategist", note: "plots the 7-day arc" },
  { role: "X Writer", note: "drafts every X post" },
  { role: "LinkedIn Writer", note: "drafts LinkedIn" },
  { role: "Instagram Writer", note: "drafts Instagram" },
  { role: "Critic", note: "grades + rewrites" },
  { role: "Media", note: "renders film + stills" },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sidebar">
      {/* brand */}
      <div style={{ padding: "22px 18px 18px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span style={{ position: "relative", width: 26, height: 26, flex: "0 0 auto" }}>
            <span style={{
              position: "absolute", inset: 0, borderRadius: 8,
              background: "radial-gradient(circle at 35% 30%, var(--ignite-2), var(--ignite) 62%, #b53d05)",
              boxShadow: "0 0 18px rgba(255,106,26,0.6), inset 0 1px 0 rgba(255,255,255,0.4)",
              animation: "glowpulse 4s ease-in-out infinite",
            }} />
          </span>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.01em" }}>Launch Control</div>
            <div className="mono" style={{ fontSize: 9.5, letterSpacing: "0.14em", color: "var(--faint)", marginTop: 2 }}>SOCIAL LAUNCH ENGINE</div>
          </div>
        </div>
      </div>

      {/* new mission */}
      <div style={{ padding: "16px 16px 8px" }}>
        <Link href="/" className="mono" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "11px 14px", borderRadius: 11, textDecoration: "none",
          fontSize: 12, letterSpacing: "0.12em", fontWeight: 700, color: "#160a02",
          background: "linear-gradient(180deg, var(--ignite-2), var(--ignite))",
          boxShadow: "0 12px 30px -12px rgba(255,106,26,0.6), inset 0 1px 0 rgba(255,255,255,0.4)",
        }}>
          <Icon d="M12 5v14M5 12h14" size={15} /> NEW MISSION
        </Link>
      </div>

      {/* nav */}
      <nav style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="eyebrow" style={{ padding: "8px 12px 6px", fontSize: 9.5 }}>Workspace</div>
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className="nav-item" data-active={active}>
              <Icon d={n.d} /> {n.label}
            </Link>
          );
        })}
      </nav>

      {/* the crew */}
      <div style={{ padding: "14px 16px 8px", marginTop: 6 }}>
        <div className="eyebrow" style={{ marginBottom: 10, fontSize: 9.5 }}>The Crew · 6 agents</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {CREW.map((c) => (
            <div key={c.role} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: "var(--go)", boxShadow: "0 0 6px var(--go)", flex: "0 0 auto" }} />
              <span style={{ fontSize: 12.5, color: "var(--fg)", fontWeight: 500 }}>{c.role}</span>
              <span className="mono" style={{ fontSize: 9.5, color: "var(--faint)", marginLeft: "auto", letterSpacing: "0.02em" }}>{c.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* footer / systems */}
      <div style={{ marginTop: "auto", padding: 16, borderTop: "1px solid var(--line)" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 12px", borderRadius: 10, background: "rgba(52,211,154,0.06)",
          border: "1px solid rgba(52,211,154,0.22)",
        }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", color: "var(--go)" }}>● SYSTEMS NOMINAL</span>
          <span className="mono" style={{ fontSize: 9, color: "var(--faint)" }}>v1.0</span>
        </div>
        <div className="eyebrow" style={{ marginTop: 12, textAlign: "center", fontSize: 9 }}>Built with Claude · Opus 4.8</div>
      </div>
    </aside>
  );
}
