"use client";

// Account widget (fixed, top-right): sign up / log in with email + password, see
// your saved launches, save the current one, and reopen past projects (which
// restores the week and its graphics). Self-contained so it drops into the app
// with a single mount. The platform itself runs on the host's server keys, so
// auth is only about saving and returning to YOUR projects.

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/use-auth";

type ProjectRow = { id: string; title: string; inputs?: any; created_at: string };

export default function AuthBar({ plan, onLoadProject }: {
  plan?: any; onLoadProject?: (plan: any) => void;
}) {
  const { user, ready, available, signIn, signUp, signOut, token } = useAuth();
  const [open, setOpen] = useState<null | "auth" | "projects">(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [savedNote, setSavedNote] = useState("");

  const loadProjects = useCallback(async () => {
    const t = await token(); if (!t) return;
    const r = await fetch("/api/projects", { headers: { Authorization: `Bearer ${t}` } });
    const d = await r.json(); setProjects(d.projects || []);
  }, [token]);

  useEffect(() => { if (user) loadProjects(); }, [user, loadProjects]);

  async function submitAuth() {
    setBusy(true); setErr("");
    try {
      if (mode === "signup") await signUp(email.trim(), pw);
      else await signIn(email.trim(), pw);
      setOpen(null); setEmail(""); setPw("");
    } catch (e: any) { setErr(String(e.message || e)); }
    setBusy(false);
  }

  async function saveCurrent() {
    if (!plan) return;
    setBusy(true); setErr(""); setSavedNote("");
    try {
      const t = await token();
      const r = await fetch("/api/projects", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ inputs: plan.inputs, plan, title: plan.inputs?.goal || plan.brand?.name }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "save failed");
      setSavedNote("Saved"); await loadProjects();
      setTimeout(() => setSavedNote(""), 2500);
    } catch (e: any) { setErr(String(e.message || e)); }
    setBusy(false);
  }

  async function openProject(id: string) {
    const t = await token();
    const r = await fetch(`/api/projects/${id}`, { headers: { Authorization: `Bearer ${t}` } });
    const d = await r.json();
    if (d.project?.plan && onLoadProject) { onLoadProject(d.project.plan); setOpen(null); }
  }
  async function removeProject(id: string) {
    const t = await token();
    await fetch(`/api/projects/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } });
    loadProjects();
  }

  if (!ready || !available) return null;

  const pill: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600,
    background: "var(--card)", border: "1px solid var(--border-strong)", borderRadius: 10,
    padding: "7px 12px", color: "var(--ink)", cursor: "pointer",
  };

  return (
    <div style={{ position: "fixed", top: 14, right: 16, zIndex: 90, display: "flex", gap: 8, alignItems: "center" }}>
      {savedNote && <span style={{ fontSize: 12, color: "var(--go)", fontWeight: 600 }}>{savedNote}</span>}
      {user && plan && (
        <button style={pill} onClick={saveCurrent} disabled={busy}>{busy ? "Saving..." : "Save launch"}</button>
      )}
      {user ? (
        <>
          <button style={pill} onClick={() => { setOpen(open === "projects" ? null : "projects"); loadProjects(); }}>My projects</button>
          <button style={{ ...pill, color: "var(--muted)" }} onClick={signOut} title={user.email}>Sign out</button>
        </>
      ) : (
        <button style={{ ...pill, background: "var(--clay)", color: "#fff", border: "1px solid var(--clay)" }} onClick={() => { setMode("login"); setOpen("auth"); }}>Sign in</button>
      )}

      {open === "projects" && (
        <div style={{ position: "absolute", top: 46, right: 0, width: 320, maxHeight: 420, overflowY: "auto", background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 14, padding: 12, boxShadow: "0 18px 50px rgba(0,0,0,0.22)" }}>
          <div className="eyebrow" style={{ color: "var(--faint)", padding: "2px 4px 8px" }}>Your launches</div>
          {projects.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)", padding: "6px 4px" }}>No saved launches yet. Generate a week and hit Save launch.</div>}
          {projects.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 6px", borderTop: "1px solid var(--border)" }}>
              <button onClick={() => openProject(p.id)} style={{ flex: 1, textAlign: "left", background: "transparent", border: 0, cursor: "pointer", color: "var(--ink)", fontSize: 13, fontWeight: 600 }}>
                {p.title || "Untitled"}
                <span style={{ display: "block", fontSize: 11, color: "var(--faint)", fontWeight: 400 }}>{new Date(p.created_at).toLocaleDateString()}</span>
              </button>
              <button onClick={() => removeProject(p.id)} title="Delete" style={{ background: "transparent", border: 0, color: "var(--faint)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>&times;</button>
            </div>
          ))}
        </div>
      )}

      {open === "auth" && (
        <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, background: "rgba(20,12,8,0.4)", backdropFilter: "blur(3px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, background: "var(--bg)", border: "1px solid var(--border-strong)", borderRadius: 18, padding: 24, boxShadow: "0 24px 60px rgba(0,0,0,0.25)" }}>
            <div className="serif" style={{ fontSize: 22, color: "var(--ink)", marginBottom: 4 }}>{mode === "signup" ? "Create your account" : "Welcome back"}</div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px" }}>Save your launches and come back to your graphics anytime.</p>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@org.com" type="email" autoComplete="email"
              style={inp} />
            <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"}
              onKeyDown={(e) => { if (e.key === "Enter") submitAuth(); }} style={{ ...inp, marginTop: 9 }} />
            {err && <p style={{ color: "var(--abort)", fontSize: 12.5, margin: "9px 0 0" }}>{err}</p>}
            <button onClick={submitAuth} disabled={busy} style={{ width: "100%", marginTop: 14, background: "var(--clay)", color: "#fff", border: 0, borderRadius: 10, padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
              {busy ? "..." : mode === "signup" ? "Create account" : "Log in"}
            </button>
            <div style={{ textAlign: "center", marginTop: 12, fontSize: 12.5, color: "var(--muted)" }}>
              {mode === "signup" ? "Already have an account? " : "New here? "}
              <button onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setErr(""); }} style={{ background: "transparent", border: 0, color: "var(--clay-deep)", fontWeight: 600, cursor: "pointer" }}>
                {mode === "signup" ? "Log in" : "Create an account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 10,
  border: "1px solid var(--border-strong)", background: "var(--card)", color: "var(--ink)", fontSize: 14,
};
