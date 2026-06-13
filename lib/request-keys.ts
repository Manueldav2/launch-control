// Request-scoped API keys. The whole point: a user can run the platform with
// THEIR OWN keys pasted in Settings, with zero server env. Each route wraps its
// body in `runWithKeys(keysFromHeaders(req.headers), ...)`, and every provider
// (llm, fal, zernio, store) reads a key via `key(name)` which prefers the
// per-request value and falls back to process.env. AsyncLocalStorage keeps it
// concurrency-safe across overlapping requests.
import { AsyncLocalStorage } from "async_hooks";

type Keys = Record<string, string>;
const als = new AsyncLocalStorage<Keys>();

export function runWithKeys<T>(keys: Keys, fn: () => T): T {
  return als.run(keys, fn);
}

// Per-request key if present (and non-empty), else the server env var.
export function key(name: string): string {
  const v = als.getStore()?.[name];
  return (v && v.trim()) || process.env[name] || "";
}

// Map the public header names to the env-var names the code reads.
const HEADER_TO_ENV: Record<string, string> = {
  "x-anthropic-key": "ANTHROPIC_API_KEY",
  "x-fal-key": "FAL_KEY",
  "x-zernio-key": "ZERNIO_API_KEY",
  "x-luma-key": "LUMA_API_KEY",
  "x-supabase-url": "SUPABASE_URL",
  "x-supabase-key": "SUPABASE_SERVICE_KEY",
};

export function keysFromHeaders(h: Headers): Keys {
  const out: Keys = {};
  for (const [hk, env] of Object.entries(HEADER_TO_ENV)) {
    const v = h.get(hk);
    if (v) out[env] = v;
  }
  return out;
}
