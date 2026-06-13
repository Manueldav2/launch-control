"use client";

// Drop-in Claude API key entry. Self-contained so it can be mounted anywhere in
// the shell without touching other components. Stores the key locally (never
// sent anywhere but the app's own engine routes, as the x-anthropic-key header).
import { useState, useEffect } from "react";
import { getApiKey, setApiKey } from "@/lib/client-key";

export default function KeyGate({ compact }: { compact?: boolean }) {
  const [val, setVal] = useState("");
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => { setVal(getApiKey()); }, []);

  const masked = val ? `sk-…${val.slice(-4)}` : "";

  function save() {
    setApiKey(val);
    setSaved(true);
    setOpen(false);
    setTimeout(() => setSaved(false), 1600);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mono" style={{
        display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer",
        fontSize: 11, letterSpacing: "0.12em",
        color: val ? "var(--go)" : "var(--ignite)",
        background: "var(--panel)", border: `1px solid ${val ? "var(--line)" : "var(--ignite)"}`,
        borderRadius: 99, padding: "7px 13px",
      }} title="Set the Claude API key the engine runs on">
        <span style={{ width: 6, height: 6, borderRadius: 99, background: val ? "var(--go)" : "var(--ignite)", boxShadow: `0 0 8px ${val ? "var(--go)" : "var(--ignite)"}` }} />
        {val ? `KEY ${masked}` : "ADD CLAUDE KEY"}
        {saved && <span style={{ color: "var(--go)" }}>✓</span>}
      </button>
    );
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: "var(--panel)", border: "1px solid var(--ignite)", borderRadius: 12, padding: "8px 10px",
      maxWidth: compact ? 320 : 420,
    }}>
      <input
        type="password" autoFocus value={val} onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="sk-ant-…" className="mono"
        style={{ flex: 1, background: "var(--void)", border: "1px solid var(--line)", borderRadius: 8,
          padding: "9px 11px", color: "var(--fg)", fontSize: 13 }} />
      <button onClick={save} className="mono" style={{
        cursor: "pointer", fontSize: 11, letterSpacing: "0.1em", color: "#160a02", fontWeight: 700,
        background: "linear-gradient(180deg, var(--ignite-2), var(--ignite))", border: 0,
        borderRadius: 8, padding: "9px 14px",
      }}>SAVE</button>
    </div>
  );
}
