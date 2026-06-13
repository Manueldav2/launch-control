// The inspection brain. Given a claimed asset row, LOOK at the image and return
// a structured report, then map that report to one of the three terminal
// verdicts the contract allows: approved | rejected | regenerated.
//
// Two backends behind one interface:
//   • vision    — Opus actually sees the image (lib/visual-critic.ts). The real
//                 critic: judges matches-intent / on-brand / clean (no garbled
//                 text, melted faces, artifacts). Needs an Anthropic key.
//   • heuristic — no key? Still inspect: decode the header, get dimensions,
//                 flag not-an-image / truncated / tiny / degenerate renders.
//                 Conservative — it only fails things that are clearly broken.
import { critiqueVisual } from "../visual-critic";
import { MODEL } from "../llm";
import { STATUS, bestImageUrl, type AssetRow, type AssetStatus, type ReviewRecord } from "./contract";
import { downloadImage } from "./client";

export interface CriticReport {
  method: "vision" | "heuristic";
  model: string | null;
  pass: boolean;
  matchesIntent: boolean;
  onBrand: boolean;
  clean: boolean;
  issues: string[];
  notes: string;
  score: number; // 0..1
  fatal: boolean; // hard reject regardless of version (e.g. the bytes aren't an image)
  inspectedUrl: string | null;
}

function intentOf(row: AssetRow): string {
  return (
    row.intent?.trim() ||
    row.prompt?.trim() ||
    row.caption?.trim() ||
    "an on-brand social post visual"
  );
}

// ── Vision backend ───────────────────────────────────────────────────────────
// critiqueVisual swallows its own errors and returns a pass=true "review
// skipped: ..." sentinel so it never blocks the *generation* pipeline. The
// reviewer, by contrast, must NOT silently approve on an API failure — so we
// detect that sentinel and signal "vision unavailable" to fall back.
class VisionUnavailable extends Error {}

async function visionReport(row: AssetRow, apiKey?: string): Promise<CriticReport> {
  const url = bestImageUrl(row);
  if (!url) throw new VisionUnavailable("no image url on row");
  const v = await critiqueVisual({
    imageUrl: url,
    intent: intentOf(row),
    brandColors: row.brand_colors ?? [],
    apiKey,
  });
  if (/^review skipped/i.test(v.notes)) throw new VisionUnavailable(v.notes);
  const score =
    (v.matchesIntent ? 0.45 : 0) + (v.clean ? 0.4 : 0) + (v.onBrand ? 0.15 : 0);
  return {
    method: "vision",
    model: MODEL,
    pass: v.pass,
    matchesIntent: v.matchesIntent,
    onBrand: v.onBrand,
    clean: v.clean,
    issues: v.issues,
    notes: v.notes,
    score: Math.round(score * 100) / 100,
    fatal: false,
    inspectedUrl: url,
  };
}

// ── Heuristic backend (no API key) ───────────────────────────────────────────
// Decode just enough of the file header to know it's a real, sane image.
// Exported for the unit test (pure, no network).
export function imageMeta(bytes: Uint8Array): { format: string; w: number; h: number } | null {
  const b = bytes;
  if (b.length < 24) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A, IHDR width/height big-endian at 16/20
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const w = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
    const h = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23];
    return { format: "png", w: w >>> 0, h: h >>> 0 };
  }
  // GIF: "GIF8", LE width/height at 6/8
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return { format: "gif", w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
  }
  // WebP: "RIFF"...."WEBP". Guard every sub-format read against truncation —
  // these bytes come off the wire, so a short/corrupt file must not index past
  // the buffer (which would silently yield bogus 0-dimensions).
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b.length >= 16 && b[8] === 0x57) {
    const fmt = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (fmt === "VP8 " && b.length >= 30) return { format: "webp", w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
    if (fmt === "VP8L" && b.length >= 25) {
      const n = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { format: "webp", w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 };
    }
    if (fmt === "VP8X" && b.length >= 30) return { format: "webp", w: (b[24] | (b[25] << 8) | (b[26] << 16)) + 1, h: (b[27] | (b[28] << 8) | (b[29] << 16)) + 1 };
    return { format: "webp", w: 0, h: 0 }; // recognised WebP, unknown/truncated size
  }
  // JPEG: FF D8, scan for SOF marker carrying dimensions
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 carry size
      if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) {
        const h = (b[i + 5] << 8) | b[i + 6];
        const w = (b[i + 7] << 8) | b[i + 8];
        return { format: "jpeg", w, h };
      }
      const len = (b[i + 2] << 8) | b[i + 3];
      if (len < 2) break;
      i += 2 + len;
    }
    return { format: "jpeg", w: 0, h: 0 };
  }
  return null;
}

async function heuristicReport(row: AssetRow): Promise<CriticReport> {
  const got = await downloadImage(row); // throws on fetch failure → reviewer requeues
  if (!got) {
    return base("heuristic", { pass: false, fatal: true, clean: false, issues: ["no image url on row"], notes: "nothing to inspect", inspectedUrl: null });
  }
  const meta = imageMeta(got.bytes);
  const issues: string[] = [];
  let fatal = false;
  if (!got.contentType.startsWith("image/") && !meta) { issues.push(`not an image (content-type ${got.contentType})`); fatal = true; }
  if (!meta) { issues.push("unrecognized/corrupt image header"); fatal = true; }
  const w = meta?.w ?? 0, h = meta?.h ?? 0;
  if (meta && (w < 256 || h < 256)) issues.push(`too small (${w}x${h})`);
  if (got.bytes.length < 1024) { issues.push(`suspiciously tiny file (${got.bytes.length}B) — likely blank/failed render`); }
  const ratio = w && h ? Math.max(w, h) / Math.min(w, h) : 1;
  if (ratio > 4) issues.push(`extreme aspect ratio ${w}x${h}`);

  const clean = !fatal && got.bytes.length >= 1024;
  const pass = clean && issues.length === 0;
  return base("heuristic", {
    pass,
    fatal,
    clean,
    matchesIntent: pass, // heuristic can't judge intent — don't assert what it can't see
    onBrand: pass,
    issues,
    notes: meta
      ? `heuristic only (no vision key): ${meta.format} ${w}x${h}, ${got.bytes.length}B`
      : "heuristic only (no vision key): could not decode image header",
    score: pass ? 0.6 : 0.1,
    inspectedUrl: got.url,
  });
}

function base(method: "vision" | "heuristic", p: Partial<CriticReport>): CriticReport {
  return {
    method,
    model: null,
    pass: false,
    matchesIntent: false,
    onBrand: false,
    clean: false,
    issues: [],
    notes: "",
    score: 0,
    fatal: false,
    inspectedUrl: null,
    ...p,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────
export interface CritiqueOpts {
  apiKey?: string; // Anthropic key override; falls back to env
  forceHeuristic?: boolean; // skip vision (tests / no-key runs)
}

// Inspect one row. Tries vision; cleanly degrades to heuristic when no key is
// available or the vision call is unusable. Never silently approves on error.
export async function critique(row: AssetRow, opts: CritiqueOpts = {}): Promise<CriticReport> {
  const hasKey = !!(opts.apiKey || process.env.ANTHROPIC_API_KEY);
  if (!opts.forceHeuristic && hasKey) {
    try {
      return await visionReport(row, opts.apiKey);
    } catch (e) {
      if (!(e instanceof VisionUnavailable)) throw e; // real bug → bubble up (row gets requeued)
      // else fall through to heuristic
    }
  }
  return heuristicReport(row);
}

// Map a report to the terminal status, bounding the regenerate loop by version.
export function decideVerdict(report: CriticReport, version: number, maxVersions: number): AssetStatus {
  if (report.pass) return STATUS.APPROVED;
  if (report.fatal) return STATUS.REJECTED; // not even a usable image
  if (version >= maxVersions) return STATUS.REJECTED; // tried enough times — give up
  return STATUS.REGENERATED; // worth another render
}

export function buildReview(report: CriticReport, verdict: AssetStatus, reviewer: string): ReviewRecord {
  return {
    verdict: verdict as ReviewRecord["verdict"],
    pass: report.pass,
    matchesIntent: report.matchesIntent,
    onBrand: report.onBrand,
    clean: report.clean,
    issues: report.issues,
    notes: report.notes,
    score: report.score,
    reviewer,
    method: report.method,
    model: report.model,
    reviewedAt: new Date().toISOString(),
    inspectedUrl: report.inspectedUrl,
  };
}
