"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { loadAssets, clearAssets, type StoredAsset } from "@/lib/assets-store";

const TYPE_LABEL: Record<string, string> = {
  text: "TEXT", image: "STILL", ugc_video: "UGC FILM", motion_video: "LAUNCH FILM",
};
const PLATFORM_LABEL: Record<string, string> = { x: "X", linkedin: "LINKEDIN", instagram: "INSTAGRAM" };
const isVid = (t: string) => t === "ugc_video" || t === "motion_video";

export default function AssetsPage() {
  const [assets, setAssets] = useState<StoredAsset[]>([]);
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");

  useEffect(() => { setAssets(loadAssets()); }, []);

  const shown = assets.filter((a) =>
    filter === "all" ? true : filter === "video" ? isVid(a.contentType) : a.contentType === "image");
  const films = assets.filter((a) => isVid(a.contentType)).length;
  const stills = assets.filter((a) => a.contentType === "image").length;

  return (
    <main style={{ position: "relative", zIndex: 2, maxWidth: 1180, margin: "0 auto", padding: "0 24px 120px" }}>
      <div className="grain" />

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "26px 0 30px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ position: "relative", width: 16, height: 16, display: "inline-block" }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: 99,
              background: "radial-gradient(circle, var(--ignite-2), var(--ignite) 60%, transparent)",
              boxShadow: "0 0 14px var(--ignite)", animation: "glowpulse 3s ease-in-out infinite" }} />
          </span>
          <span className="mono" style={{ fontSize: 12, letterSpacing: "0.16em", color: "var(--muted)" }}>LAUNCH&nbsp;CONTROL</span>
        </div>
        <nav style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Link href="/" className="mono" style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--faint)", textDecoration: "none" }}>CONSOLE</Link>
          <span className="mono" style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--ignite)" }}>ASSETS</span>
        </nav>
      </header>

      <section className="rise" style={{ marginBottom: 26 }}>
        <p className="eyebrow" style={{ marginBottom: 10 }}>ASSET BAY · GENERATED MEDIA</p>
        <h1 style={{ fontSize: "clamp(34px,5vw,52px)", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1, margin: 0 }}>
          Everything the crew<br /><span style={{ color: "var(--ignite)" }}>has filmed.</span>
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 15, marginTop: 14, maxWidth: 560, lineHeight: 1.6 }}>
          Every still and film the engine renders lands here, ready to download or push live.
        </p>
      </section>

      {/* filter rail */}
      <div className="rise" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {([["all", `ALL · ${assets.length}`], ["image", `STILLS · ${stills}`], ["video", `FILMS · ${films}`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k as any)} className="mono" style={{
            fontSize: 11, letterSpacing: "0.1em", cursor: "pointer", padding: "7px 14px", borderRadius: 99,
            border: `1px solid ${filter === k ? "var(--ignite)" : "var(--line)"}`,
            color: filter === k ? "var(--ember)" : "var(--muted)",
            background: filter === k ? "rgba(255,106,26,0.07)" : "var(--panel)",
          }}>{label}</button>
        ))}
        {assets.length > 0 && (
          <button onClick={() => { clearAssets(); setAssets([]); }} className="mono" style={{
            marginLeft: "auto", fontSize: 10.5, letterSpacing: "0.1em", cursor: "pointer", color: "var(--faint)",
            background: "transparent", border: "1px solid var(--line-bright)", borderRadius: 8, padding: "7px 12px",
          }}>↻ CLEAR</button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="rise" style={{
          border: "1px dashed var(--line-bright)", borderRadius: 16, padding: "60px 24px", textAlign: "center",
        }}>
          <p style={{ color: "var(--muted)", fontSize: 15, marginBottom: 18 }}>
            No assets yet. Run a launch sequence and render the stills and films.
          </p>
          <Link href="/" className="mono" style={{
            display: "inline-block", fontSize: 12, letterSpacing: "0.12em", color: "#160a02", textDecoration: "none",
            background: "linear-gradient(180deg, var(--ignite-2), var(--ignite))", borderRadius: 10, padding: "12px 20px",
            boxShadow: "0 14px 36px -14px rgba(255,106,26,0.6)",
          }}>▲ TO THE CONSOLE</Link>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(248px,1fr))", gap: 14 }}>
          {shown.map((a, i) => (
            <div key={a.url} className="rise" style={{
              animationDelay: `${i * 40}ms`, border: "1px solid var(--line)", borderRadius: 14,
              overflow: "hidden", background: "var(--panel)",
            }}>
              <div style={{ aspectRatio: "1 / 1", background: "var(--void)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {isVid(a.contentType)
                  ? <video src={a.url} controls playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={a.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              </div>
              <div style={{ padding: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                  <span className="mono" style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--muted)" }}>
                    {PLATFORM_LABEL[a.platform] || a.platform} · {a.day}
                  </span>
                  <span className="mono" style={{ fontSize: 8.5, letterSpacing: "0.08em", color: "var(--faint)",
                    border: "1px solid var(--line-bright)", borderRadius: 5, padding: "2px 6px" }}>{TYPE_LABEL[a.contentType] || a.contentType}</span>
                </div>
                <p style={{ fontSize: 12, color: "var(--fg)", opacity: 0.8, lineHeight: 1.4, margin: "0 0 10px", minHeight: 34 }}>{a.caption}</p>
                <a href={a.url} download target="_blank" rel="noopener noreferrer" className="mono" style={{
                  display: "inline-block", fontSize: 10.5, letterSpacing: "0.1em", color: "var(--ignite)",
                  border: "1px solid var(--ignite)", borderRadius: 8, padding: "6px 12px", textDecoration: "none",
                }}>↓ DOWNLOAD</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
