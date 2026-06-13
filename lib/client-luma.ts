// The Luma API key the user pastes via the Connect button lives here
// (localStorage). Every Luma call sends it as x-luma-key. Luma has no OAuth, so
// this paste-once key IS the connection.
"use client";

const KEY = "lc:luma-key";

export function getLumaKey(): string {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
}

export function setLumaKey(v: string): void {
  if (typeof window === "undefined") return;
  try {
    if (v) localStorage.setItem(KEY, v.trim());
    else localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

export function lumaHeaders(): Record<string, string> {
  const k = getLumaKey();
  return k ? { "x-luma-key": k } : {};
}
