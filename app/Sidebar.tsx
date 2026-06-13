"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

// Anthropic-style asterisk mark, in clay.
function Spark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--clay)" aria-hidden>
      <path d="M12 2c.3 3.1.9 5.2 2 6.4C15.2 9.6 17.3 10.2 20 10.5c-2.7.3-4.8.9-6 2.1-1.1 1.2-1.7 3.3-2 6.4-.3-3.1-.9-5.2-2-6.4-1.2-1.2-3.3-1.8-6-2.1 2.7-.3 4.8-.9 6-2.1 1.1-1.2 1.7-3.3 2-6.4z" />
    </svg>
  );
}

const NAV = [
  { href: "/", label: "New launch", d: "M12 5v14M5 12h14" },
  { href: "/", label: "Console", d: "M4 6h16M4 12h16M4 18h10", match: "/" },
  { href: "/assets", label: "Asset Bay", d: "M3 8l9-5 9 5-9 5-9-5zm0 8l9 5 9-5M3 12l9 5 9-5" },
];

const CREW = [
  "Strategist", "X Writer", "LinkedIn Writer", "Instagram Writer", "Critic", "Media",
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sidebar">
      {/* wordmark */}
      <div style={{ padding: "18px 16px 10px", display: "flex", alignItems: "center", gap: 9 }}>
        <Spark size={20} />
        <span className="serif" style={{ fontSize: 20, color: "var(--ink)", fontWeight: 500, letterSpacing: "-0.01em" }}>Launch Control</span>
      </div>

      {/* primary nav */}
      <nav style={{ padding: "8px 10px 4px", display: "flex", flexDirection: "column", gap: 2 }}>
        <Link href="/" className="nav-item" data-active={path === "/"}>
          <Icon d="M4 6h16M4 12h16M4 18h10" /> Console
        </Link>
        <Link href="/assets" className="nav-item" data-active={path.startsWith("/assets")}>
          <Icon d="M3 8l9-5 9 5-9 5-9-5zm0 8l9 5 9-5M3 12l9 5 9-5" /> Asset Bay
        </Link>
      </nav>

      {/* the crew */}
      <div style={{ padding: "16px 10px 4px" }}>
        <div className="side-label">The crew</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {CREW.map((c) => (
            <div key={c} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 11px", fontSize: 13.5, color: "var(--text)" }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--go)", flex: "0 0 auto" }} />
              {c}
            </div>
          ))}
        </div>
      </div>

      {/* recents (illustrative — recent missions) */}
      <div style={{ padding: "14px 10px 4px", flex: 1, overflowY: "auto" }}>
        <div className="side-label">Recent missions</div>
        {["Beach cleanup · Surfrider", "Holiday food drive", "Clean-water 5k"].map((r) => (
          <div key={r} className="nav-item" style={{ color: "var(--muted)", fontWeight: 500, cursor: "default" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r}</span>
          </div>
        ))}
      </div>

      {/* footer */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          width: 30, height: 30, borderRadius: 99, flex: "0 0 auto",
          background: "var(--clay)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700,
        }}>MD</span>
        <div style={{ lineHeight: 1.25 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Myles David</div>
          <div style={{ fontSize: 11.5, color: "var(--faint)" }}>Built with Claude · Opus 4.8</div>
        </div>
      </div>
    </aside>
  );
}
