"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Ic, Mark, PlatformGlyph } from "./icons";

// Recent missions — clicking one loads it into the composer (via sessionStorage
// + a 'lc:mission' event the Console listens for) and routes to the console.
const RECENT = [
  { label: "Beach cleanup", sub: "Surfrider", goal: "Get 50 volunteers to our Saturday beach cleanup", cta: "Sign up at the link to join the cleanup", website: "https://www.surfrider.org" },
  { label: "Holiday food drive", sub: "Feeding America", goal: "Fill 500 holiday meal boxes by Saturday's food drive", cta: "Donate or volunteer at the link", website: "https://www.feedingamerica.org" },
  { label: "Clean-water 5k", sub: "charity: water", goal: "Sell out our Saturday charity 5k for clean water", cta: "Register at the link before spots run out", website: "https://www.charitywater.org" },
];
const CREW = ["Strategist", "X Writer", "LinkedIn Writer", "Instagram Writer", "Critic", "Media"];
const CHANNELS = [{ p: "x", label: "X" }, { p: "linkedin", label: "LinkedIn" }, { p: "instagram", label: "Instagram" }];

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const [mini, setMini] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("lc:mini") === "1";
    setMini(saved);
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--side-w", mini ? "76px" : "264px");
    localStorage.setItem("lc:mini", mini ? "1" : "0");
  }, [mini]);

  function loadMission(m: typeof RECENT[number]) {
    sessionStorage.setItem("lc:mission", JSON.stringify({ goal: m.goal, cta: m.cta, website: m.website }));
    if (path !== "/") router.push("/");
    window.dispatchEvent(new Event("lc:mission"));
  }
  function newLaunch() {
    window.dispatchEvent(new Event("lc:new"));
    if (path !== "/") router.push("/");
  }

  const onAssets = path.startsWith("/assets");

  return (
    <aside className={`sidebar${mini ? " sidebar--mini" : ""}`}>
      {/* wordmark + collapse */}
      <div style={{ padding: "16px 14px 12px", display: "flex", alignItems: "center", gap: 10 }}>
        <Mark size={26} />
        <span className="wordmark-text serif" style={{ fontSize: 19, color: "var(--ink)", fontWeight: 500, letterSpacing: "-0.01em", flex: 1, transition: "opacity .2s" }}>Launch Control</span>
        <button onClick={() => setMini((v) => !v)} aria-label="Toggle sidebar" title="Toggle sidebar"
          style={{ background: "transparent", border: 0, color: "var(--faint)", cursor: "pointer", padding: 4, borderRadius: 8, display: "flex" }}>
          <Ic name="panel" size={17} />
        </button>
      </div>

      {/* new launch */}
      <div style={{ padding: "6px 12px 8px" }}>
        <button onClick={newLaunch} className="glass-btn" style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: mini ? "center" : "flex-start", gap: 9,
          padding: "10px 12px", borderRadius: 12, fontSize: 13.5, fontWeight: 600, color: "var(--clay-deep)",
          background: "rgba(217,119,87,0.14)", borderColor: "rgba(217,119,87,0.3)",
        }}>
          <Ic name="plus" size={17} /> <span className="nav-label">New launch</span>
        </button>
      </div>

      {/* primary nav */}
      <nav style={{ padding: "4px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
        <Link href="/" className="nav-item" data-active={path === "/"}>
          <span className="nav-ico"><Ic name="console" /></span> <span className="nav-label">Console</span>
        </Link>
        <Link href="/assets" className="nav-item" data-active={onAssets}>
          <span className="nav-ico"><Ic name="layers" /></span> <span className="nav-label">Asset Bay</span>
        </Link>
      </nav>

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "6px 10px 0" }}>
        {/* MORPH: console shows the crew + recent; asset bay shows the library */}
        {!onAssets ? (
          <>
            <div className="side-label">The crew</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {CREW.map((c) => (
                <div key={c} className="nav-item" style={{ cursor: "default" }} title={c}>
                  <span className="nav-ico"><span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--go)", boxShadow: "0 0 6px rgba(90,125,87,0.6)" }} /></span>
                  <span className="nav-label">{c}</span>
                </div>
              ))}
            </div>

            <div className="side-label" style={{ marginTop: 8 }}>Recent missions</div>
            {RECENT.map((m) => (
              <button key={m.label} onClick={() => loadMission(m)} className="nav-item" style={{ width: "100%", textAlign: "left", background: "transparent" }} title={`Load: ${m.label}`}>
                <span className="nav-ico"><Ic name="clock" size={16} /></span>
                <span className="nav-label" style={{ overflow: "hidden" }}>
                  <span style={{ display: "block", color: "var(--ink)", fontWeight: 500, fontSize: 13.5, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{m.label}</span>
                  <span style={{ display: "block", color: "var(--faint)", fontSize: 11.5 }}>{m.sub}</span>
                </span>
              </button>
            ))}
          </>
        ) : (
          <>
            <div className="side-label">Library</div>
            {[{ ic: "layers", label: "All assets" }, { ic: "image", label: "Stills" }, { ic: "film", label: "Films" }].map((r) => (
              <Link key={r.label} href="/assets" className="nav-item">
                <span className="nav-ico"><Ic name={r.ic} size={17} /></span> <span className="nav-label">{r.label}</span>
              </Link>
            ))}
            <div className="side-label" style={{ marginTop: 8 }}>Tip</div>
            <p className="nav-label" style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, padding: "2px 12px 8px" }}>
              Render stills and films from any launch, then download or push them live.
            </p>
          </>
        )}

        {/* channels */}
        <div className="side-label" style={{ marginTop: 8 }}>Channels</div>
        {CHANNELS.map((c) => (
          <div key={c.p} className="nav-item" style={{ cursor: "default" }} title={`${c.label} · not connected`}>
            <span className="nav-ico" style={{ color: "var(--muted)" }}><PlatformGlyph p={c.p} size={15} /></span>
            <span className="nav-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1 }}>
              {c.label}
              <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--border-strong)" }} />
            </span>
          </div>
        ))}
        <div style={{ padding: "4px 8px 12px" }}>
          <button onClick={() => window.open("/api/connect", "_blank")} className="glass-btn nav-label" style={{
            width: "100%", padding: "8px 12px", borderRadius: 10, fontSize: 12.5, fontWeight: 600,
            color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}>
            <Ic name="broadcast" size={15} /> Connect channels
          </button>
        </div>
      </div>

      {/* footer */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "11px 13px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          width: 30, height: 30, borderRadius: 99, flex: "0 0 auto",
          background: "linear-gradient(180deg, #e8906f, var(--clay))", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
        }}>MD</span>
        <div className="foot-text" style={{ lineHeight: 1.25, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Myles David</div>
          <div style={{ fontSize: 11.5, color: "var(--faint)" }}>Built with Claude · Opus 4.8</div>
        </div>
        <Ic name="gear" size={16} className="foot-text" />
      </div>
    </aside>
  );
}
