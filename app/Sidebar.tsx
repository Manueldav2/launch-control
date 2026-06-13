"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Ic, Mark, PlatformGlyph } from "./icons";

const RECENT = [
  { label: "Beach cleanup", sub: "Surfrider", goal: "Get 50 volunteers to our Saturday beach cleanup", cta: "Sign up at the link to join the cleanup", website: "https://www.surfrider.org" },
  { label: "Holiday food drive", sub: "Feeding America", goal: "Fill 500 holiday meal boxes by Saturday's food drive", cta: "Donate or volunteer at the link", website: "https://www.feedingamerica.org" },
  { label: "Clean-water 5k", sub: "charity: water", goal: "Sell out our Saturday charity 5k for clean water", cta: "Register at the link before spots run out", website: "https://www.charitywater.org" },
];
const CREW = ["Strategist", "X Writer", "LinkedIn Writer", "Instagram Writer", "Critic", "Media"];
const CHANNELS = [{ p: "x", label: "X" }, { p: "linkedin", label: "LinkedIn" }, { p: "instagram", label: "Instagram" }, { p: "tiktok", label: "TikTok" }, { p: "luma", label: "Luma" }];

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const [mini, setMini] = useState(false);
  const [settings, setSettings] = useState(false);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    setMini(localStorage.getItem("lc:mini") === "1");
    setReduce(localStorage.getItem("lc:reduce") === "1");
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--side-w", mini ? "72px" : "264px");
    localStorage.setItem("lc:mini", mini ? "1" : "0");
  }, [mini]);
  useEffect(() => {
    document.documentElement.classList.toggle("no-motion", reduce);
    localStorage.setItem("lc:reduce", reduce ? "1" : "0");
  }, [reduce]);

  async function clearData() {
    try { const { clearAssets } = await import("@/lib/assets-store"); clearAssets(); } catch {}
    try { sessionStorage.removeItem("lc:mission"); } catch {}
    setSettings(false);
    if (path !== "/") router.push("/"); else window.dispatchEvent(new Event("lc:new"));
  }

  function loadMission(m: typeof RECENT[number]) {
    sessionStorage.setItem("lc:mission", JSON.stringify({ goal: m.goal, cta: m.cta, website: m.website }));
    if (path !== "/") router.push("/");
    window.dispatchEvent(new Event("lc:mission"));
  }
  function newLaunch() {
    window.dispatchEvent(new Event("lc:new"));
    if (path !== "/") router.push("/");
  }

  const [assetFilter, setAssetFilterState] = useState("all");
  useEffect(() => { setAssetFilterState(sessionStorage.getItem("lc:assetFilter") || "all"); }, [path]);
  function setAssetFilter(f: string) {
    sessionStorage.setItem("lc:assetFilter", f);
    setAssetFilterState(f);
    if (path !== "/assets") router.push("/assets");
    window.dispatchEvent(new Event("lc:assetFilter"));
  }

  const onAssets = path.startsWith("/assets");

  // ── collapsed icon rail ──────────────────────────────────────────────────
  if (mini) {
    const RailBtn = ({ children, onClick, active, title }:
      { children: React.ReactNode; onClick?: () => void; active?: boolean; title: string }) => (
      <button onClick={onClick} title={title} aria-label={title} style={{
        width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
        border: "1px solid transparent", cursor: "pointer",
        background: active ? "rgba(217,119,87,0.14)" : "transparent",
        color: active ? "var(--clay-deep)" : "var(--text)",
      }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.6)"; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}>
        {children}
      </button>
    );
    return (
      <aside className="sidebar sidebar--mini" style={{ alignItems: "center" }}>
        <div style={{ padding: "16px 0 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <button onClick={() => setMini(false)} title="Expand sidebar" aria-label="Expand sidebar" style={{
            width: 40, height: 40, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid var(--border)", background: "rgba(255,255,255,0.5)", color: "var(--muted)", cursor: "pointer",
          }}><Ic name="panel" size={17} /></button>
          <Link href="/" title="Launch Control" style={{ display: "flex", padding: 6 }}><Mark size={24} /></Link>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginTop: 4 }}>
          <RailBtn onClick={newLaunch} title="New launch">
            <span style={{ width: 38, height: 38, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(217,119,87,0.16)", color: "var(--clay-deep)" }}><Ic name="plus" size={18} /></span>
          </RailBtn>
          <RailBtn onClick={() => router.push("/")} active={path === "/"} title="Console"><Ic name="console" /></RailBtn>
          <RailBtn onClick={() => router.push("/assets")} active={onAssets} title="Asset Bay"><Ic name="layers" /></RailBtn>
          <RailBtn onClick={() => router.push("/calendar")} active={path.startsWith("/calendar")} title="Calendar"><Ic name="calendar" /></RailBtn>
          <RailBtn onClick={() => router.push("/channels")} active={path.startsWith("/channels")} title="Channels"><Ic name="broadcast" /></RailBtn>
          <RailBtn onClick={() => router.push("/landing")} title="Landing page"><span style={{ color: "var(--clay-deep)", display: "flex" }}><Ic name="bolt" /></span></RailBtn>
        </div>
        <div style={{ marginTop: "auto", padding: "12px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <RailBtn onClick={() => setSettings(true)} title="Settings"><Ic name="gear" size={17} /></RailBtn>
          <span title="Manuel David" style={{ width: 30, height: 30, borderRadius: 99, background: "linear-gradient(180deg, #e8906f, var(--clay))", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)" }}>MD</span>
        </div>
        {settings && <SettingsModal onClose={() => setSettings(false)} mini={mini} setMini={setMini} reduce={reduce} setReduce={setReduce} onClear={clearData} />}
      </aside>
    );
  }

  // ── expanded ─────────────────────────────────────────────────────────────
  return (
    <aside className="sidebar">
      <div style={{ padding: "16px 14px 12px", display: "flex", alignItems: "center", gap: 10 }}>
        <Mark size={26} />
        <span className="serif" style={{ fontSize: 19, color: "var(--ink)", fontWeight: 500, letterSpacing: "-0.01em", flex: 1 }}>Launch Control</span>
        <button onClick={() => setMini(true)} aria-label="Collapse sidebar" title="Collapse sidebar"
          style={{ background: "transparent", border: 0, color: "var(--faint)", cursor: "pointer", padding: 6, borderRadius: 8, display: "flex" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.05)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
          <Ic name="panel" size={17} />
        </button>
      </div>

      <div style={{ padding: "6px 12px 8px" }}>
        <button onClick={newLaunch} className="glass-btn" style={{
          width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", borderRadius: 12,
          fontSize: 13.5, fontWeight: 600, color: "var(--clay-deep)", background: "rgba(217,119,87,0.14)", borderColor: "rgba(217,119,87,0.3)",
        }}><Ic name="plus" size={17} /> New launch</button>
      </div>

      <nav style={{ padding: "4px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
        <Link href="/" className="nav-item" data-active={path === "/"}>
          <span className="nav-ico"><Ic name="console" /></span> Console
        </Link>
        <button onClick={() => { if (typeof window !== "undefined") window.dispatchEvent(new Event("lc:open-projects")); }}
          className="nav-item" style={{ width: "100%", textAlign: "left", background: "transparent", border: 0, cursor: "pointer", font: "inherit" }}>
          <span className="nav-ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg></span>
          My projects
        </button>
        <Link href="/assets" className="nav-item" data-active={onAssets}>
          <span className="nav-ico"><Ic name="layers" /></span> Asset Bay
        </Link>
        <Link href="/calendar" className="nav-item" data-active={path.startsWith("/calendar")}>
          <span className="nav-ico"><Ic name="calendar" /></span> Calendar
        </Link>
        <Link href="/channels" className="nav-item" data-active={path === "/channels"}>
          <span className="nav-ico"><Ic name="broadcast" /></span> Channels
        </Link>
        <Link href="/landing" className="nav-item" style={{ color: "var(--clay-deep)" }} title="View the landing page">
          <span className="nav-ico"><Ic name="bolt" /></span>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1 }}>
            Landing page <Ic name="arrowRight" size={14} />
          </span>
        </Link>
      </nav>

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "6px 10px 0" }}>
        {!onAssets ? (
          <>
            <div className="side-label">The crew</div>
            {CREW.map((c) => (
              <div key={c} className="nav-item" style={{ cursor: "default" }}>
                <span className="nav-ico"><span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--go)", boxShadow: "0 0 6px rgba(90,125,87,0.6)" }} /></span>
                {c}
              </div>
            ))}
            <div className="side-label" style={{ marginTop: 8 }}>Recent missions</div>
            {RECENT.map((m) => (
              <button key={m.label} onClick={() => loadMission(m)} className="nav-item" style={{ width: "100%", textAlign: "left", background: "transparent" }} title={`Load: ${m.label}`}>
                <span className="nav-ico"><Ic name="clock" size={16} /></span>
                <span style={{ overflow: "hidden" }}>
                  <span style={{ display: "block", color: "var(--ink)", fontWeight: 500, fontSize: 13.5, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{m.label}</span>
                  <span style={{ display: "block", color: "var(--faint)", fontSize: 11.5 }}>{m.sub}</span>
                </span>
              </button>
            ))}
          </>
        ) : (
          <>
            <div className="side-label">Library</div>
            {[{ ic: "layers", label: "All assets", f: "all" }, { ic: "image", label: "Stills", f: "image" }, { ic: "film", label: "Films", f: "video" }].map((r) => (
              <button key={r.label} onClick={() => setAssetFilter(r.f)} className="nav-item" data-active={assetFilter === r.f}
                style={{ width: "100%", textAlign: "left", background: "transparent" }}>
                <span className="nav-ico"><Ic name={r.ic} size={17} /></span> {r.label}
              </button>
            ))}
            <div className="side-label" style={{ marginTop: 8 }}>Tip</div>
            <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, padding: "2px 12px 8px" }}>
              Render stills and films from any launch, then download or push them live.
            </p>
          </>
        )}

        <div className="side-label" style={{ marginTop: 8 }}>Channels</div>
        {CHANNELS.map((c) => (
          <Link key={c.p} href={`/channels/${c.p}`} className="nav-item" data-active={path === `/channels/${c.p}`} title={`Preview ${c.label}`}>
            <span className="nav-ico" style={{ color: "var(--muted)" }}><PlatformGlyph p={c.p} size={15} /></span>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1 }}>
              {c.label}
              <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--border-strong)" }} />
            </span>
          </Link>
        ))}
        <div style={{ padding: "4px 8px 12px" }}>
          <Link href="/channels" className="glass-btn" style={{
            width: "100%", padding: "8px 12px", borderRadius: 10, fontSize: 12.5, fontWeight: 600,
            color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            textDecoration: "none", boxSizing: "border-box",
          }}><Ic name="broadcast" size={15} /> Connect channels</Link>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", padding: "11px 13px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 30, height: 30, borderRadius: 99, flex: "0 0 auto", background: "linear-gradient(180deg, #e8906f, var(--clay))", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)" }}>MD</span>
        <div style={{ lineHeight: 1.25, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Manuel David</div>
          <div style={{ fontSize: 11.5, color: "var(--faint)" }}>Built with Claude · Opus 4.8</div>
        </div>
        <button onClick={() => setSettings(true)} aria-label="Settings" title="Settings"
          style={{ background: "transparent", border: 0, color: "var(--muted)", cursor: "pointer", padding: 6, borderRadius: 8, display: "flex" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.05)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
          <Ic name="gear" size={16} />
        </button>
      </div>
      {settings && <SettingsModal onClose={() => setSettings(false)} mini={mini} setMini={setMini} reduce={reduce} setReduce={setReduce} onClear={clearData} />}
    </aside>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} role="switch" aria-checked={on} style={{
      width: 42, height: 24, borderRadius: 99, border: 0, cursor: "pointer", padding: 0, position: "relative", flex: "0 0 auto",
      background: on ? "var(--clay)" : "var(--border-strong)", transition: "background .16s ease",
    }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: 99, background: "#fff", transition: "left .16s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
    </button>
  );
}

function SettingsModal({ onClose, mini, setMini, reduce, setReduce, onClear }:
  { onClose: () => void; mini: boolean; setMini: (v: boolean) => void; reduce: boolean; setReduce: (v: boolean) => void; onClear: () => void }) {
  const Row = ({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 0", borderTop: "1px solid var(--border)" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{desc}</div>
      </div>
      {children}
    </div>
  );
  if (typeof document === "undefined") return null;
  return createPortal((
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 60, background: "rgba(31,30,27,0.34)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: "fadein .2s ease both",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="lg lg-strong" style={{ width: "min(440px, 94vw)", borderRadius: 20, padding: "22px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h2 className="serif" style={{ fontSize: 24, fontWeight: 400, color: "var(--ink)", margin: 0 }}>Settings</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: 0, color: "var(--muted)", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--faint)", margin: "0 0 6px" }}>Workspace preferences. Saved on this device.</p>

        <Row title="Reduce motion" desc="Turn off animations and the liquid-glass shimmer.">
          <Toggle on={reduce} onClick={() => setReduce(!reduce)} />
        </Row>
        <Row title="Start collapsed" desc="Open the sidebar as a compact icon rail.">
          <Toggle on={mini} onClick={() => setMini(!mini)} />
        </Row>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/landing" onClick={onClose} className="glass-btn" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, color: "var(--clay-deep)" }}>
            <Ic name="bolt" size={15} /> View landing page
          </Link>
          <Link href="/assets" onClick={onClose} className="glass-btn" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 10, fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
            <Ic name="layers" size={15} /> Asset Bay
          </Link>
          <button onClick={onClear} style={{ marginLeft: "auto", background: "transparent", border: "1px solid var(--border-strong)", color: "var(--abort)", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
            Clear saved data
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <span style={{ width: 32, height: 32, borderRadius: 99, background: "linear-gradient(180deg, #e8906f, var(--clay))", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>MD</span>
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>Manuel David</div>
            <div style={{ fontSize: 12, color: "var(--faint)" }}>Paradigm Outreach · Built with Claude Opus 4.8</div>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}
