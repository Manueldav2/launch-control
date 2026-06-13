import type { Metadata } from "next";
import { Newsreader, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import Sidebar from "./Sidebar";

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const sans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Launch Control",
  description: "One idea in. A whole week of on-brand launch content out, planned, made, and graded by a swarm of Claude agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        {/* liquid-glass refraction lens — referenced by .lg--refract backdrop-filter */}
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
          <filter id="lgDistort" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="noise" />
            <feGaussianBlur in="noise" stdDeviation="1.4" result="blur" />
            <feDisplacementMap in="SourceGraphic" in2="blur" scale="22" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
        <Sidebar />
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
