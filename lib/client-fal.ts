"use client";
// The user's own fal.ai key (entered after the free media limit) lives here
// (localStorage). When set, render requests send it as x-fal-key and the server
// renders on their key, bypassing the free quota.
const KEY = "lc:fal-key";

export function getFalKey(): string {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
}
export function setFalKey(v: string): void {
  if (typeof window === "undefined") return;
  try { if (v) localStorage.setItem(KEY, v.trim()); else localStorage.removeItem(KEY); } catch { /* ignore */ }
}
export function falHeader(): Record<string, string> {
  const k = getFalKey();
  return k ? { "x-fal-key": k } : {};
}
