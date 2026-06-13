import { ImageResponse } from "next/og";

// Rich link-preview card — what shows when launch-control-phi.vercel.app is
// shared over iMessage / Slack / X / LinkedIn. Next auto-wires this as og:image
// (1200x630) for every route. Built with divs/gradients only (Satori-safe).

export const alt = "Launch Control — a week of on-brand content, planned and graded by Claude agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CLAY = "#d97757";
const CLAY_DEEP = "#bd5d3a";

function Chip({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 56,
        height: 56,
        borderRadius: 14,
        background: bg,
        color: "#fff",
        fontSize: 30,
        fontWeight: 800,
      }}
    >
      {children}
    </div>
  );
}

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 76,
          background: "linear-gradient(135deg, #1c1a17 0%, #2a221d 55%, #3a2a20 100%)",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* clay glow */}
        <div
          style={{
            position: "absolute",
            top: -160,
            right: -120,
            width: 520,
            height: 520,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(217,119,87,0.55) 0%, rgba(217,119,87,0) 70%)",
            display: "flex",
          }}
        />

        {/* top: mark + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: `linear-gradient(160deg, ${CLAY}, ${CLAY_DEEP})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 12px 40px rgba(217,119,87,0.5)",
            }}
          >
            <div style={{ width: 30, height: 30, borderRadius: "50%", border: "5px solid #fff", display: "flex" }} />
          </div>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#f5f1ea", letterSpacing: -0.5 }}>
            Launch Control
          </div>
        </div>

        {/* center: headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: -20 }}>
          <div style={{ display: "flex", fontSize: 82, fontWeight: 800, color: "#ffffff", lineHeight: 1.02, letterSpacing: -2, maxWidth: 940 }}>
            One idea in. A whole week out.
          </div>
          <div style={{ display: "flex", fontSize: 33, color: "rgba(245,241,234,0.74)", lineHeight: 1.35, maxWidth: 880 }}>
            On-brand launch content. Planned, written, and graded by a swarm of Claude agents.
          </div>
        </div>

        {/* bottom: platform chips + url */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Chip bg="#0f0f0f">X</Chip>
            <Chip bg="#0a66c2">in</Chip>
            <Chip bg="linear-gradient(45deg,#f09433,#dc2743 50%,#bc1888)">
              <div style={{ width: 30, height: 30, borderRadius: 9, border: "4px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", border: "3px solid #fff", display: "flex" }} />
              </div>
            </Chip>
            <div style={{ display: "flex", fontSize: 26, color: "rgba(245,241,234,0.6)", marginLeft: 8 }}>
              X · LinkedIn · Instagram
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 26px",
              borderRadius: 999,
              background: `linear-gradient(160deg, ${CLAY}, ${CLAY_DEEP})`,
              color: "#fff",
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            launch-control-phi.vercel.app
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
