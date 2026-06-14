// Programmatic motion-graphics video — the "vibe motion" / launch-film engine.
// A motion launch video is NOT a generative Veo clip; it is kinetic brand
// graphics (the hyper-cut look): hard-cut text beats in the brand colors, an
// optional product image, a logo/CTA end card. We draw each beat as a PNG with
// @napi-rs/canvas (real font, crisp text) and let ffmpeg stitch the PNGs into
// clips with NO filters (works on any ffmpeg build — Lambda's lacks drawtext).
// Opus writes the storyboard; rendering is pure compute, deterministic, on-brand.
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, mkdtemp, rm, chmod } from "fs/promises";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import ffmpegStatic from "ffmpeg-static";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { ask, extractJson } from "./llm";
import { db } from "./store";

const exec = promisify(execFile);
const FONT = path.join(process.cwd(), "assets", "fonts", "Inter.ttf");
const BUCKET = process.env.SUPABASE_MEDIA_BUCKET || "media";
const FALLBACK_BG = ["#f97316", "#0b0b0f", "#1a1a1f"];
let _fontReady = false;
function ensureFont() {
  if (_fontReady) return;
  try { if (existsSync(FONT)) GlobalFonts.registerFromPath(FONT, "Inter"); } catch { /* fall back to a default sans */ }
  _fontReady = true;
}
function resolveFfmpeg(): string {
  const cands = [
    ffmpegStatic as unknown as string,
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
    "/var/task/node_modules/ffmpeg-static/ffmpeg",
  ].filter(Boolean) as string[];
  for (const c of cands) { try { if (existsSync(c)) return c; } catch { /* next */ } }
  return (ffmpegStatic as unknown as string) || "ffmpeg";
}
let FFMPEG = (ffmpegStatic as unknown as string) || "ffmpeg";

export type Scene =
  | { type: "text"; text: string; seconds?: number; style?: string }
  | { type: "image"; image_url: string; caption?: string; seconds?: number }
  | { type: "logo"; tagline?: string; cta?: string; seconds?: number };
export type Storyboard = { scenes: Scene[] };

function lum(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
const ink = (bg: string) => (lum(bg) > 150 ? "#111111" : "#ffffff");
const dur = (s?: number) => Math.min(Math.max(Number(s) || 1.8, 0.8), 4.0);

async function run(args: string[], timeoutMs = 120000): Promise<void> {
  await exec(FFMPEG, args, { timeout: timeoutMs, maxBuffer: 1 << 26 });
}

// Draw centered, word-wrapped text on a colored canvas -> PNG buffer.
function drawText(text: string, w: number, h: number, bg: string, fontPx: number, color?: string): Buffer {
  ensureFont();
  const cv = createCanvas(w, h); const ctx = cv.getContext("2d");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color || ink(bg);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const maxW = w * 0.84;
  // wrap by measuring at this font size
  const fit = (px: number) => {
    ctx.font = `600 ${px}px Inter, sans-serif`;
    const lines: string[] = [];
    for (const para of (text || "").split("\n")) {
      const words = para.split(/\s+/).filter(Boolean); let cur = "";
      for (const word of words) {
        const t = cur ? cur + " " + word : word;
        if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = word; }
        else cur = t;
      }
      if (cur) lines.push(cur);
    }
    return lines.length ? lines : [text || ""];
  };
  let px = fontPx; let lines = fit(px);
  // shrink if too many lines for the frame
  while (lines.length * px * 1.18 > h * 0.7 && px > 28) { px = Math.floor(px * 0.9); lines = fit(px); }
  const lh = px * 1.18; const start = h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((ln, i) => ctx.fillText(ln, w / 2, start + i * lh));
  return cv.toBuffer("image/png");
}

// Image scene: cover-fit the fetched image, dark scrim + caption at the bottom.
async function drawImageScene(url: string, caption: string, w: number, h: number): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { redirect: "follow" }); if (!r.ok) return null;
    const img = await loadImage(Buffer.from(await r.arrayBuffer()));
    const cv = createCanvas(w, h); const ctx = cv.getContext("2d");
    ctx.fillStyle = "#0b0b0f"; ctx.fillRect(0, 0, w, h);
    const s = Math.max(w / img.width, h / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    if (caption?.trim()) {
      ensureFont();
      const grad = ctx.createLinearGradient(0, h * 0.6, 0, h);
      grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, "rgba(0,0,0,0.78)");
      ctx.fillStyle = grad; ctx.fillRect(0, h * 0.6, w, h * 0.4);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.font = `600 52px Inter, sans-serif`;
      ctx.fillText(caption.slice(0, 80), w / 2, h - h * 0.07);
    }
    return cv.toBuffer("image/png");
  } catch { return null; }
}

// Logo end card: dark bg, optional logo image centered, tagline/cta below.
async function drawLogoScene(logoUrl: string, tagline: string, cta: string, w: number, h: number): Promise<Buffer> {
  ensureFont();
  const cv = createCanvas(w, h); const ctx = cv.getContext("2d");
  ctx.fillStyle = "#0b0b0f"; ctx.fillRect(0, 0, w, h);
  let drewLogo = false;
  if (logoUrl) {
    try {
      const r = await fetch(logoUrl, { redirect: "follow" });
      if (r.ok) {
        const img = await loadImage(Buffer.from(await r.arrayBuffer()));
        const lw = w * 0.34, lh2 = (img.height / img.width) * lw;
        ctx.drawImage(img, (w - lw) / 2, h / 2 - lh2 - 40, lw, lh2); drewLogo = true;
      }
    } catch { /* no logo */ }
  }
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const text = [tagline, cta].filter((x) => x && x.trim());
  const baseY = drewLogo ? h / 2 + 70 : h / 2 - (text.length - 1) * 40;
  text.forEach((ln, i) => {
    ctx.font = `600 ${i === 0 ? 62 : 46}px Inter, sans-serif`;
    ctx.fillStyle = i === 0 ? "#fff" : "#f97316";
    ctx.fillText(ln, w / 2, baseY + i * 90);
  });
  return cv.toBuffer("image/png");
}

// Render a storyboard to an mp4 Buffer (+ a poster). Canvas draws each beat;
// ffmpeg loops each PNG into a clip and concats — no text/overlay filters.
export async function renderStoryboard(storyboard: Storyboard, brand: { colors?: string[]; logo?: string; name?: string } = {}, aspect: "9:16" | "16:9" = "9:16"): Promise<{ video: Buffer; poster: Buffer; seconds: number }> {
  const scenes = (storyboard?.scenes || []).slice(0, 10);
  if (!scenes.length) throw new Error("storyboard has no scenes");
  const [w, h] = aspect === "16:9" ? [1920, 1080] : [1080, 1920];
  const valid = (brand.colors || []).filter((c) => /^#?[0-9a-fA-F]{6}$/.test(c || "")).map((c) => "#" + c.replace("#", ""));
  const palette: string[] = [];
  for (const c of (valid.length ? valid : FALLBACK_BG).slice(0, 3)) { palette.push(c); palette.push("#0b0b0f"); }
  FFMPEG = resolveFfmpeg();
  try { await chmod(FFMPEG, 0o755); } catch { /* may already be +x */ }
  const tmp = await mkdtemp(path.join(os.tmpdir(), "motion_"));
  try {
    const clips: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const sc: any = scenes[i];
      const kind = (sc.type || "text").toLowerCase();
      const d = dur(sc.seconds);
      let png: Buffer | null = null;
      if (kind === "image" && sc.image_url) png = await drawImageScene(sc.image_url, sc.caption || "", w, h);
      if (!png && kind === "logo") png = await drawLogoScene(brand.logo || "", sc.tagline || brand.name || "", sc.cta || "", w, h);
      if (!png) {
        const bg = palette[i % palette.length];
        const base = aspect === "9:16" ? 96 : 84;
        const size = Math.floor(base * ((sc.style || "").toLowerCase() === "hook" ? 1.25 : 1.0));
        png = drawText(sc.text || sc.caption || "", w, h, bg, size);
      }
      const pngPath = path.join(tmp, `f${i}.png`);
      await writeFile(pngPath, png);
      const clip = path.join(tmp, `s${i}.mp4`);
      await run(["-y", "-loop", "1", "-t", String(d), "-i", pngPath, "-r", "30",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", clip]);
      clips.push(clip);
    }
    const listfile = path.join(tmp, "list.txt");
    await writeFile(listfile, clips.map((c) => `file '${c}'`).join("\n"));
    const final = path.join(tmp, "final.mp4");
    await run(["-y", "-f", "concat", "-safe", "0", "-i", listfile, "-c:v", "libx264",
      "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", final], 180000);
    const poster = path.join(tmp, "poster.jpg");
    await run(["-y", "-i", final, "-ss", "0.5", "-frames:v", "1", poster]);
    const video = await readFile(final);
    const posterBuf = await readFile(poster).catch(() => Buffer.alloc(0));
    const seconds = scenes.reduce((s, sc: any) => s + dur(sc.seconds), 0);
    return { video, poster: posterBuf, seconds: Math.round(seconds * 10) / 10 };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

// Opus writes a storyboard from the slot copy + intent + brand.
export async function buildMotionStoryboard(opts: { copy: string; intent?: string; brand?: { name?: string; voice?: string }; cta?: string; apiKey?: string }): Promise<Storyboard> {
  try {
    const out = await ask({
      apiKey: opts.apiKey, maxTokens: 500,
      system: "You storyboard a 10-14s kinetic-typography launch video (hard-cut text beats, like a bold motion-graphics promo). No em-dashes, no hype words, no invented facts.",
      user:
        `Brand: ${opts.brand?.name || ""} (voice: ${opts.brand?.voice || "warm, direct"}).\n` +
        `Post copy: ${opts.copy}\nGoal of the clip: ${opts.intent || "drive the launch"}\nCTA: ${opts.cta || ""}\n\n` +
        `Return ONLY JSON {"scenes":[...]} with 4-6 scenes that build momentum:\n` +
        `- first {"type":"text","text":"<punchy hook, <=6 words>","style":"hook","seconds":2}\n` +
        `- 2-4 {"type":"text","text":"<one short line, <=7 words>","seconds":1.8} beats\n` +
        `- last {"type":"logo","tagline":"<3-5 word payoff>","cta":"<short CTA>","seconds":2.4}\n` +
        `Punchy, concrete, human. Each line stands alone on screen.`,
    });
    const j = extractJson(out);
    if (Array.isArray(j.scenes) && j.scenes.length) return { scenes: j.scenes };
  } catch { /* fall through */ }
  const lines = String(opts.copy || "").split(/[.!?\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const scenes: Scene[] = lines.map((t, i) => ({ type: "text", text: t, style: i === 0 ? "hook" : undefined, seconds: 1.8 }));
  scenes.push({ type: "logo", tagline: opts.brand?.name || "", cta: opts.cta || "", seconds: 2.4 });
  return { scenes };
}

async function upload(bytes: Buffer, ext: string, ctype: string): Promise<string> {
  const c = db();
  if (!c || !bytes.length) return "";
  try {
    try { await c.storage.createBucket(BUCKET, { public: true }); } catch { /* exists */ }
    const tag = Math.abs((bytes.length * 2654435761) % 1e9).toString(36) + bytes.length.toString(36);
    const p = `motion/${tag}.${ext}`;
    const { error } = await c.storage.from(BUCKET).upload(p, bytes, { contentType: ctype, upsert: true });
    if (error) return "";
    return c.storage.from(BUCKET).getPublicUrl(p).data.publicUrl;
  } catch { return ""; }
}

// storyboard -> render -> store. Returns { url, stillUrl } like the other renderers.
export async function renderMotionVideo(opts: { copy: string; intent?: string; brand?: { name?: string; voice?: string; colors?: string[]; logo?: string }; cta?: string; aspect?: "9:16" | "16:9"; apiKey?: string }): Promise<{ url: string; stillUrl: string; seconds: number }> {
  const storyboard = await buildMotionStoryboard(opts);
  const { video, poster, seconds } = await renderStoryboard(storyboard, opts.brand || {}, opts.aspect || "9:16");
  const url = await upload(video, "mp4", "video/mp4");
  const stillUrl = poster.length ? await upload(poster, "jpg", "image/jpeg") : "";
  if (!url) throw new Error("motion video render produced no storable url (Supabase storage required)");
  return { url, stillUrl: stillUrl || url, seconds };
}
