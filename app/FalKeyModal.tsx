"use client";

// "Use your own fal.ai key" — appears after the free media limit (or from the
// quota prompt). Pasting a key stores it locally; render requests then send it
// and the server renders on the user's account, bypassing the free quota. Opened
// via the "lc:open-fal-key" event so any 402 handler can summon it.

import { useEffect, useState } from "react";
import { getFalKey, setFalKey } from "@/lib/client-fal";

export default function FalKeyModal() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const onOpen = () => { setKey(getFalKey()); setSaved(false); setOpen(true); };
    window.addEventListener("lc:open-fal-key", onOpen);
    return () => window.removeEventListener("lc:open-fal-key", onOpen);
  }, []);

  if (!open) return null;
  function save() {
    setFalKey(key.trim());
    setSaved(true);
    setTimeout(() => setOpen(false), 700);
  }

  return (
    <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(20,12,8,0.4)", backdropFilter: "blur(3px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="rise" style={{ width: "100%", maxWidth: 440, background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 18, padding: 24, boxShadow: "0 24px 60px rgba(0,0,0,0.25)" }}>
        <div className="serif" style={{ fontSize: 21, color: "var(--ink)", marginBottom: 5 }}>Use your own fal.ai key</div>
        <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 16px", lineHeight: 1.55 }}>
          Your free plan covers one image and one video. Paste a fal.ai API key to keep rendering on your own account, with no limit. The key stays in your browser and is sent only with your render requests.
        </p>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="fal-ai key..." type="password"
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 10, border: "1px solid var(--border-strong)", background: "var(--card)", color: "var(--ink)", fontSize: 14 }} />
        <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
          <button onClick={() => { setFalKey(""); setKey(""); setOpen(false); }} style={{ flex: "0 0 auto", background: "transparent", border: "1px solid var(--border-strong)", color: "var(--muted)", borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Remove key</button>
          <button onClick={save} style={{ flex: 1, background: "var(--clay)", border: 0, color: "#fff", borderRadius: 9, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
            {saved ? "Saved" : "Save key"}
          </button>
        </div>
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--clay-deep)", textDecoration: "none" }}>Get a fal.ai key</a>
        </div>
      </div>
    </div>
  );
}
