// The Claude API key the user pastes in the UI lives here (localStorage), and
// every engine fetch sends it as the x-anthropic-key header. So the app works
// with no .env on the box running it — paste a key and go.
"use client";

const KEY = "lc:anthropic-key";

export function getApiKey(): string {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
}

export function setApiKey(v: string): void {
  if (typeof window === "undefined") return;
  try {
    if (v) localStorage.setItem(KEY, v.trim());
    else localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

// Spread into fetch() so the engine receives the UI key.
export function keyHeaders(): Record<string, string> {
  const k = getApiKey();
  return k ? { "x-anthropic-key": k } : {};
}
