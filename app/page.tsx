"use client";

import { useState } from "react";

type Slot = {
  platform: string; reaction: string; contentType: string; copy: string;
  mediaPrompt?: string; mediaUrl?: string; grade?: { pass: boolean; failures: string[] };
};
type Day = { day: number; weekday: string; cta: string; theme: string; isEventDay: boolean; slots: Slot[] };
type Plan = { brand: { name: string; voice: string; summary: string; colors: string[] }; days: Day[] };

const PLATFORM_LABEL: Record<string, string> = { x: "X", linkedin: "LinkedIn", instagram: "Instagram" };
const TYPE_LABEL: Record<string, string> = {
  text: "Text", image: "Image", ugc_video: "UGC video", motion_video: "Launch video",
};

export default function Home() {
  const [goal, setGoal] = useState("Get 50 volunteers to our Saturday beach cleanup");
  const [cta, setCta] = useState("Sign up at the link to join the cleanup");
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [scorecard, setScorecard] = useState<{ total: number; passing: number; fixed: number } | null>(null);
  const [mediaBusy, setMediaBusy] = useState<string | null>(null);

  async function generate() {
    setErr(""); setLoading(true); setPlan(null); setScorecard(null);
    try {
      const r = await fetch("/api/generate-week", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, cta, website }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "failed");
      setPlan(d.plan); setScorecard(d.scorecard);
    } catch (e: any) { setErr(String(e.message || e)); }
    setLoading(false);
  }

  async function makeMedia(dayIdx: number, slotIdx: number) {
    if (!plan) return;
    const slot = plan.days[dayIdx].slots[slotIdx];
    const id = `${dayIdx}:${slotIdx}`;
    setMediaBusy(id);
    try {
      const r = await fetch("/api/generate-media", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: slot.contentType, prompt: slot.mediaPrompt || slot.copy }),
      });
      const d = await r.json();
      if (d.url) {
        const next = structuredClone(plan);
        next.days[dayIdx].slots[slotIdx].mediaUrl = d.url;
        setPlan(next);
      } else { setErr(d.error || "media failed"); }
    } catch (e: any) { setErr(String(e.message || e)); }
    setMediaBusy(null);
  }

  const isVid = (t: string) => t === "ugc_video" || t === "motion_video";

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 24px" }}>
      <header style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Launch Control <span style={{ color: "var(--accent)" }}>·</span>
        </h1>
        <p style={{ color: "var(--muted)", marginTop: 6, fontSize: 15 }}>
          One idea in. A whole week of on-brand launch content out, written, made, and graded by a swarm of Claude agents.
        </p>
      </header>

      <section style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <Field label="What are you trying to accomplish?" value={goal} onChange={setGoal} />
        <Field label="Your call to action" value={cta} onChange={setCta} />
        <Field label="Nonprofit / brand website" value={website} onChange={setWebsite} placeholder="https://..." />
        <button onClick={generate} disabled={loading}
          style={{ marginTop: 8, background: "var(--accent)", color: "#0a0a0b", fontWeight: 700,
            border: 0, borderRadius: 10, padding: "11px 18px", fontSize: 15, cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
          {loading ? "The swarm is working…" : "Generate the week"}
        </button>
        {err && <p style={{ color: "#f87171", marginTop: 12, fontSize: 13 }}>{err}</p>}
      </section>

      {plan && (
        <>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
            <Badge>{plan.brand?.name || "Brand"}</Badge>
            {scorecard && (
              <Badge accent={scorecard.passing === scorecard.total}>
                {scorecard.passing}/{scorecard.total} passed the critic · {scorecard.fixed} auto-fixed
              </Badge>
            )}
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            {plan.days.map((day, di) => (
              <div key={day.day} style={{ background: "var(--panel)", border: `1px solid ${day.isEventDay ? "var(--accent)" : "var(--border)"}`, borderRadius: 14, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <strong style={{ fontSize: 15 }}>
                    Day {day.day} · {day.weekday}{day.isEventDay ? " · EVENT" : ""}
                  </strong>
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>{day.theme}</span>
                </div>
                <div style={{ color: "var(--accent)", fontSize: 13, marginBottom: 12 }}>CTA: {day.cta}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
                  {day.slots.map((slot, si) => (
                    <div key={si} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{PLATFORM_LABEL[slot.platform] || slot.platform}</span>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>{TYPE_LABEL[slot.contentType] || slot.contentType}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>↳ {slot.reaction}</div>
                      <p style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{slot.copy}</p>
                      {slot.mediaUrl && (isVid(slot.contentType) ? (
                        <video src={slot.mediaUrl} controls style={{ width: "100%", borderRadius: 8, marginTop: 8 }} />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={slot.mediaUrl} alt="" style={{ width: "100%", borderRadius: 8, marginTop: 8 }} />
                      ))}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                        {slot.grade && (
                          <span style={{ fontSize: 11, color: slot.grade.pass ? "#34d399" : "#f87171" }}>
                            {slot.grade.pass ? "✓ passed" : `✗ ${slot.grade.failures.join(", ")}`}
                          </span>
                        )}
                        {(slot.contentType === "image" || isVid(slot.contentType)) && !slot.mediaUrl && (
                          <button onClick={() => makeMedia(di, si)} disabled={mediaBusy === `${di}:${si}`}
                            style={{ fontSize: 11, background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>
                            {mediaBusy === `${di}:${si}` ? "rendering…" : `Make ${TYPE_LABEL[slot.contentType]}`}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 5 }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", background: "#0a0a0b", border: "1px solid var(--border)", borderRadius: 9, padding: "10px 12px", color: "var(--fg)", fontSize: 14 }} />
    </label>
  );
}

function Badge({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span style={{ fontSize: 12, padding: "5px 11px", borderRadius: 999,
      border: `1px solid ${accent ? "var(--accent)" : "var(--border)"}`,
      color: accent ? "var(--accent)" : "var(--fg)", background: "var(--panel)" }}>
      {children}
    </span>
  );
}
