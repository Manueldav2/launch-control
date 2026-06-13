"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

/**
 * Scroll-driven laptop reveal — the lid hinges open and the whole rig scales up
 * as it enters the viewport, with the REAL generated week glowing on the screen.
 * Brand-adapted (deep-space + ignition orange) instead of the stock silver look,
 * so it sits inside the mission-control aesthetic rather than fighting it.
 */
export default function MacbookReveal({
  src = "/launch-week.png",
  title = "Made while you scroll.",
  sub = "The whole week, on one screen. Planned, written, graded, and cleared for launch before a single post goes out.",
}: { src?: string; title?: string; sub?: string }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });

  // Lid hinges from ajar (18deg) to fully open (0) over the first half of the pass.
  const lidRotate = useTransform(scrollYProgress, [0.08, 0.42], [18, 0]);
  const rigScale = useTransform(scrollYProgress, [0.08, 0.5], [0.86, 1]);
  const rigY = useTransform(scrollYProgress, [0, 1], [40, -40]);
  const screenGlow = useTransform(scrollYProgress, [0.1, 0.45], [0.15, 0.6]);
  const titleOpacity = useTransform(scrollYProgress, [0.04, 0.16, 0.34, 0.46], [0, 1, 1, 0]);
  const titleY = useTransform(scrollYProgress, [0.04, 0.46], [24, -24]);

  // Reduced motion: render the laptop open and still, no scroll binding.
  const lid = reduce ? 0 : lidRotate;
  const scl = reduce ? 1 : rigScale;
  const ty = reduce ? 0 : rigY;

  return (
    <section ref={ref} aria-label="Launch Control on screen"
      style={{ position: "relative", height: "165vh", marginTop: 40, background: "var(--void)" }}>
      <div style={{
        position: "sticky", top: 0, height: "100vh",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        {/* fading headline above the rig */}
        <motion.div style={{ opacity: reduce ? 1 : titleOpacity, y: reduce ? 0 : titleY, textAlign: "center", marginBottom: 26, zIndex: 2 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Mission readout</div>
          <h2 style={{ fontSize: "clamp(28px, 4.4vw, 52px)", fontWeight: 800, letterSpacing: "-0.03em", margin: 0, lineHeight: 1.02 }}>
            {title}
          </h2>
          <p style={{ maxWidth: 540, margin: "16px auto 0", color: "var(--muted)", fontSize: 15.5, lineHeight: 1.6 }}>{sub}</p>
        </motion.div>

        {/* the laptop rig */}
        <motion.div style={{ scale: scl, y: ty, perspective: 1600, transformStyle: "preserve-3d", flex: "0 0 auto" }}>
          {/* lid + screen */}
          <motion.div style={{
            width: "min(760px, 84vw)", aspectRatio: "16 / 10", transformOrigin: "bottom center",
            rotateX: lid, position: "relative", borderRadius: 18, padding: 10,
            background: "linear-gradient(180deg, #1a1a22, #0c0c11)",
            border: "1px solid var(--line-bright)",
            boxShadow: "0 50px 130px -50px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}>
            {/* camera notch */}
            <div style={{ position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)", width: 5, height: 5, borderRadius: 99, background: "#2a2a33", boxShadow: "inset 0 0 2px #000" }} />
            {/* screen */}
            <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 11, overflow: "hidden", background: "var(--void)", border: "1px solid #000" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="A finished, all-GO launch week inside Launch Control" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top left", display: "block" }} />
              {/* ignition glow that warms as the lid opens */}
              <motion.div aria-hidden style={{
                position: "absolute", inset: 0, pointerEvents: "none", opacity: reduce ? 0.4 : screenGlow,
                background: "radial-gradient(120% 80% at 50% -10%, rgba(255,106,26,0.18), transparent 55%)",
              }} />
              {/* screen sheen */}
              <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(115deg, rgba(255,255,255,0.06) 0%, transparent 22%)" }} />
            </div>
          </motion.div>

          {/* base / keyboard deck */}
          <div style={{ position: "relative", width: "min(820px, 90vw)", margin: "0 auto", height: 22 }}>
            <div style={{
              position: "absolute", top: -1, left: "50%", transform: "translateX(-50%)",
              width: "100%", height: 22, borderRadius: "8px 8px 14px 14px",
              background: "linear-gradient(180deg, #20202a, #14141b 40%, #0e0e13)",
              border: "1px solid var(--line-bright)", borderTop: "none",
              boxShadow: "0 30px 50px -30px rgba(0,0,0,0.9)",
            }}>
              {/* hinge lip + trackpad notch */}
              <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 110, height: 5, borderRadius: "0 0 7px 7px", background: "linear-gradient(180deg, #2a2a35, #16161d)" }} />
            </div>
          </div>
        </motion.div>

        <div className="mono" style={{ marginTop: 30, fontSize: 11, letterSpacing: "0.14em", color: "var(--faint)", zIndex: 2 }}>
          <span style={{ color: "var(--go)" }}>●</span> 12 POSTS · 7 DAYS · ALL GRADED GO
        </div>
      </div>
    </section>
  );
}
