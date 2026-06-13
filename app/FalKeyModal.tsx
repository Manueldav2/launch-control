"use client";

// "Bring your own keys" — run the whole platform on your own accounts. The free
// tier covers planning + one image + one video on the host's keys; add your own
// keys here to render unlimited media (fal.ai) and run planning on your own
// Anthropic key. Keys stay in your browser and are sent only with your requests
// (x-fal-key / x-anthropic-key). Opened via the "lc:open-fal-key" event (e.g. the
// free-limit prompt) or the "Use your own keys" link.

import { useEffect, useState } from "react";
import { getFalKey, setFalKey } from "@/lib/client-fal";
import { getApiKey, setApiKey } from "@/lib/client-key";

export default function FalKeyModal() {
  const [open, setOpen] = useState(false);
  const [fal, setFal] = useState("");
  const [anthropic, setAnthropic] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const onOpen = () => { setFal(getFalKey()); setAnthropic(getApiKey()); setSaved(false); setOpen(true); };
    window.addEventListener("lc:open-fal-key", onOpen);
    window.addEventListener("lc:open-keys", onOpen);
    return () => { window.removeEventListener("lc:open-fal-key", onOpen); window.removeEventListener("lc:open-keys", onOpen); };
  }, []);

  if (!open) return null;
  function save() {
    setFalKey(fal.trim());
    setApiKey(anthropic.trim());
    setSaved(true);
    setTimeout(() => setOpen(false), 700);
  }

  return (
    <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(20,12,8,0.4)", backdropFilter: "blur(3px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="rise" style={{ width: "100%", maxWidth: 460, background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 18, padding: 24, boxShadow: "0 24px 60px rgba(0,0,0,0.25)" }}>
        <div className="serif" style={{ fontSize: 21, color: "var(--ink)", marginBottom: 5 }}>Bring your own keys</div>
        <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.55 }}>
          Your free plan covers planning plus one image and one video. Add your own keys to render unlimited media and run on your own account. Keys stay in your browser and are sent only with your requests.
        </p>

        <Field label="fal.ai key" hint="unlimited image + video renders" value={fal} onChange={setFal} placeholder="fal-ai key..." link="https://fal.ai/dashboard/keys" linkText="Get a fal.ai key" />
        <div style={{ height: 12 }} />
        <Field label="Anthropic key" hint="run planning + copy on your own key" value={anthropic} onChange={setAnthropic} placeholder="sk-ant-..." link="https://console.anthropic.com/settings/keys" linkText="Get an Anthropic key" />

        <div style={{ display: "flex", gap: 9, marginTop: 18 }}>
          <button onClick={() => { setFalKey(""); setApiKey(""); setFal(""); setAnthropic(""); setOpen(false); }} style={{ flex: "0 0 auto", background: "transparent", border: "1px solid var(--border-strong)", color: "var(--muted)", borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Clear keys</button>
          <button onClick={save} style={{ flex: 1, background: "var(--clay)", border: 0, color: "#fff", borderRadius: 9, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
            {saved ? "Saved" : "Save keys"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, value, onChange, placeholder, link, linkText }: {
  label: string; hint: string; value: string; onChange: (v: string) => void; placeholder: string; link: string; linkText: string;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{label}</span>
        <a href={link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--clay-deep)", textDecoration: "none" }}>{linkText}</a>
      </div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type="password"
        style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-strong)", background: "var(--card)", color: "var(--ink)", fontSize: 13.5 }} />
      <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 4 }}>{hint}</div>
    </div>
  );
}
