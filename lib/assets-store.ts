// Browser-side store for every still/film the engine renders, so the Assets
// gallery can show them across the session. Honest + simple: localStorage,
// newest first, capped so it can't bloat.
"use client";

export type StoredAsset = {
  url: string;
  contentType: string;
  platform: string;
  day: string;
  brand: string;
  caption: string;
  ts: number;
};

const KEY = "lc:assets:v1";

export function loadAssets(): StoredAsset[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

export function saveAsset(a: Omit<StoredAsset, "ts">): void {
  if (typeof window === "undefined") return;
  try {
    const all = loadAssets().filter((x) => x.url !== a.url); // de-dupe by url
    all.unshift({ ...a, ts: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, 60)));
  } catch { /* best-effort */ }
}

export function clearAssets(): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(KEY); } catch {}
}
