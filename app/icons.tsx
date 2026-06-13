// Apple/SF-adjacent line icons — inline SVG, rounded joins, consistent 1.7 stroke.
// No icon dependency; path data is hand-set in the Lucide (MIT) idiom.
import * as React from "react";

const P: Record<string, string> = {
  plus: "M12 5v14M5 12h14",
  console: "M4 6h16M4 12h16M4 18h10",
  layers: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5",
  image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 5 5",
  clock: "M12 7.5V12l3 1.8M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  broadcast: "M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M12 11.5a.6.6 0 1 0 .01 0",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 14a1.5 1.5 0 0 0 .3 1.7l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.5 1.5 0 0 0-2.55 1.06V20a2 2 0 1 1-4 0v-.08A1.5 1.5 0 0 0 7 18.46l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05A1.5 1.5 0 0 0 4 14a2 2 0 1 1 0-4h.08A1.5 1.5 0 0 0 5.54 7L5.49 7a2 2 0 1 1 2.83-2.83l.05.05A1.5 1.5 0 0 0 10 4.6V4a2 2 0 1 1 4 0v.08a1.5 1.5 0 0 0 2.46 1.06l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05A1.5 1.5 0 0 0 19.4 10H20a2 2 0 1 1 0 4h-.08a1.5 1.5 0 0 0-1.38.92z",
  panel: "M4 5h16v14H4zM10 5v14",
  arrowUp: "M12 19V5M6 11l6-6 6 6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  check: "M5 12.5l4.5 4.5L19 7",
  download: "M12 4v11M7.5 11l4.5 4 4.5-4M5 19.5h14",
  sparkle: "M12 4c.4 2.4 1 3.8 2.4 4.6C15.6 9.4 17 10 19 10.4c-2 .4-3.4 1-4.6 1.8C13 13 12.4 14.4 12 16.8c-.4-2.4-1-3.8-2.4-4.6C8.4 11.4 7 10.8 5 10.4c2-.4 3.4-1 4.6-1.8C10.9 7.8 11.6 6.4 12 4z",
  bolt: "M13 3L5 13h6l-1 8 8-10h-6l1-8z",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  calendar: "M7 3v3M17 3v3M4 8.5h16M5 6h14v14H5z",
  film: "M4 4h16v16H4zM4 9h16M4 15h16M9 4v16M15 4v16",
  pen: "M16.5 4.5l3 3L8 19l-4 1 1-4 11.5-11.5z",
  play: "M7 4.5l12 7.5-12 7.5z",
};

export function Ic({ name, size = 18, stroke = 1.7, className }:
  { name: string; size?: number; stroke?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={P[name] || P.console} />
    </svg>
  );
}

// Distinct brand mark — a liquid-glass clay orb (NOT an asterisk/star), so we
// read as our own thing rather than claude.ai.
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: size * 0.32, flex: "0 0 auto", position: "relative",
      display: "inline-block",
      background: "radial-gradient(120% 120% at 30% 22%, #f2a988, var(--clay) 52%, #a84e2f)",
      boxShadow: "inset 0 1.5px 1px rgba(255,255,255,0.75), inset 0 -3px 6px rgba(120,40,20,0.4), 0 6px 16px -6px rgba(189,93,58,0.6)",
    }}>
      <span style={{
        position: "absolute", top: "16%", left: "20%", width: "44%", height: "30%", borderRadius: "50%",
        background: "linear-gradient(180deg, rgba(255,255,255,0.85), transparent)", filter: "blur(0.3px)",
      }} />
    </span>
  );
}

export function PlatformGlyph({ p, size = 14 }: { p: string; size?: number }) {
  const c = { width: size, height: size, fill: "currentColor" } as const;
  if (p === "x") return <svg viewBox="0 0 24 24" {...c}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>;
  if (p === "linkedin") return <svg viewBox="0 0 24 24" {...c}><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452z"/></svg>;
  return <svg viewBox="0 0 24 24" {...c}><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>;
}
