import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";
export const alt = "Launch Control — a whole week of content, written, filmed, and graded, posted across every channel.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Branded link preview that mirrors the landing: warm-dark canvas, orange glow,
// the Paradigm mark, and the headline.
export default async function OgImage() {
  let logoSrc = "";
  try {
    const buf = readFileSync(join(process.cwd(), "public", "paradigm_mark.png"));
    logoSrc = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {}

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", padding: "70px 78px", color: "#fff",
          backgroundColor: "#141110", fontFamily: "sans-serif",
          backgroundImage:
            "radial-gradient(900px 520px at 16% -5%, rgba(249,115,22,0.42), transparent 60%), radial-gradient(760px 520px at 104% 108%, rgba(255,150,90,0.30), transparent 60%)",
        }}
      >
        {/* brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {logoSrc ? <img src={logoSrc} width={58} height={52} alt="" /> : null}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>Launch Control</div>
            <div style={{ fontSize: 19, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>a Paradigm Outreach project</div>
          </div>
        </div>

        {/* headline */}
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.08 }}>
          <div style={{ fontSize: 68, fontWeight: 800, letterSpacing: -2 }}>A whole week of content,</div>
          <div style={{ fontSize: 68, fontWeight: 800, letterSpacing: -2, color: "#f97316" }}>written, filmed, and graded,</div>
          <div style={{ fontSize: 68, fontWeight: 800, letterSpacing: -2 }}>posted across every channel.</div>
        </div>

        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 26, color: "rgba(255,255,255,0.62)" }}>One sentence in. Seven days of on-brand posts out.</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: "#ffb27a" }}>Built with Claude · Opus 4.8</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
