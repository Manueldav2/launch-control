// Dead-simple disk cache so the demo is instant and cheap after the first run.
// Keyed by a hash of whatever you pass. Media URLs and the week plan both cache
// here, so re-running the same inputs never re-spends on Claude or fal.
import { createHash } from "crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const DIR = join(process.cwd(), ".cache");

export function cacheKey(parts: unknown): string {
  return createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}

export function cacheGet<T>(key: string): T | null {
  try {
    const f = join(DIR, `${key}.json`);
    if (!existsSync(f)) return null;
    return JSON.parse(readFileSync(f, "utf8")) as T;
  } catch {
    return null;
  }
}

export function cacheSet<T>(key: string, value: T): void {
  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, `${key}.json`), JSON.stringify(value, null, 2));
  } catch {
    // best-effort; cache failures must never break a run
  }
}
