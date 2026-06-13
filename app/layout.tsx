import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Launch Control",
  description: "One idea in. A whole week of on-brand, self-graded launch content out.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
