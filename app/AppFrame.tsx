"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

// The landing is full-bleed (no sidebar / no content offset); everything else
// runs inside the app shell with the sidebar.
export default function AppFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path === "/landing" || path.startsWith("/landing/")) return <>{children}</>;
  return (
    <>
      <Sidebar />
      <div className="app-shell">{children}</div>
    </>
  );
}
