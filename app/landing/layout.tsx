import type { Metadata } from "next";

const TITLE = "Launch Control · an open-source Paradigm Outreach project";
const DESC =
  "A whole week of content, written, filmed, and graded, posted across every channel. Give it one sentence; a crew of Claude agents plans, writes, films, and grades a week of on-brand posts. Open source.";

// Absolute base so the preview image resolves everywhere (X, iMessage, Slack,
// Discord, WhatsApp, LinkedIn). Override per-deploy with NEXT_PUBLIC_SITE_URL.
const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://launch-control-ph.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: TITLE,
  description: DESC,
  openGraph: {
    title: TITLE,
    description: DESC,
    type: "website",
    siteName: "Launch Control",
    url: "/landing",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
  },
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
