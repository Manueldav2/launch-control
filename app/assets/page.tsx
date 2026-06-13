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
    <main style={{ position: "relative", zIndex: 2, maxWidth: 1100, margin: "0 auto", padding: "52px 28px 120px" }}>
      <section className="rise" style={{ marginBottom: 28 }}>
        <p className="eyebrow" style={{ marginBottom: 12 }}>Asset Bay · generated media</p>
        <h1 className="serif" style={{ fontSize: "clamp(32px,4.2vw,48px)", fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1.05, margin: 0, color: "var(--ink)" }}>
          Everything the crew has made.
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 15.5, marginTop: 14, maxWidth: 540, lineHeight: 1.6 }}>
          Every still and film the engine renders lands here, ready to download or push live.
        </p>
      </section>

      {/* filter rail */}
      <div className="rise" style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 22, flexWrap: "wrap" }}>
        {([["all", `All · ${assets.length}`], ["image", `Stills · ${stills}`], ["video", `Films · ${films}`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k as any)} style={{
            fontSize: 13, cursor: "pointer", padding: "7px 14px", borderRadius: 10, fontWeight: 500,
            border: `1px solid ${filter === k ? "var(--clay)" : "var(--border-strong)"}`,
            color: filter === k ? "var(--clay-deep)" : "var(--text)",
            background: filter === k ? "var(--clay-bg)" : "var(--card)",
          }}>{label}</button>
        ))}
        {assets.length > 0 && (
          <button onClick={() => { clearAssets(); setAssets([]); }} style={{
            marginLeft: "auto", fontSize: 13, cursor: "pointer", color: "var(--muted)",
            background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 9, padding: "7px 13px",
          }}>Clear</button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="rise" style={{
          border: "1px solid var(--border)", background: "var(--card)", borderRadius: 16, padding: "64px 24px", textAlign: "center",
        }}>
          <p style={{ color: "var(--muted)", fontSize: 15.5, marginBottom: 20 }}>
            No assets yet. Run a launch and render the stills and films.
          </p>
          <Link href="/" style={{
            display: "inline-block", fontSize: 14, fontWeight: 500, color: "#fff", textDecoration: "none",
            background: "var(--clay)", borderRadius: 11, padding: "11px 20px",
          }}>To the console</Link>
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
