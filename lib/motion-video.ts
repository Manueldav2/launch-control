// Programmatic motion-graphics video — the "vibe motion" / launch-film engine.
// A motion launch video is NOT a generative Veo clip; it is kinetic brand
// graphics (the Remotion/hyper-cut look): hard-cut text beats in the brand
// colors, an optional product image with a slow push, a logo/CTA end card. We
// render it deterministically with ffmpeg (ffmpeg-static), so every frame is
// exactly the brand with no generation lottery. Ported from Paradigm's
// motion_video.py. Opus writes the storyboard; rendering is pure compute.
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, mkdtemp, rm, chmod } from "fs/promises";
import os from "os";
import path from "path";
import ffmpegStatic from "ffmpeg-static";
import { ask, extractJson } from "./llm";
import { db } from "./store";

const exec = promisify(execFile);
const FFMPEG = (ffmpegStatic as unknown as string) || "ffmpeg";
const FONT = path.join(process.cwd(), "assets", "fonts", "Inter.ttf");
const BUCKET = process.env.SUPABASE_MEDIA_BUCKET || "media";
const FALLBACK_BG = ["#f97316", "#0b0b0f", "#1a1a1f"];

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
const textColor = (bg: string) => (lum(bg) > 150 ? "0x111111" : "white");
const ffColor = (hex: string) => "0x" + hex.replace("#", "");
const dur = (s?: number) => Math.min(Math.max(Number(s) || 1.6, 0.8), 4.0);

function wrap(text: string, fontsize: number, widthPx: number): string {
  const perLine = Math.max(8, Math.floor((widthPx * 0.86) / (fontsize * 0.52)));
  const out: string[] = [];
  for (const ln of (text || "").split("\n")) {
    if (!ln.trim()) { out.push(""); continue; }
    const words = ln.split(/\s+/); let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > perLine && cur) { out.push(cur); cur = w; }
      else cur = (cur ? cur + " " : "") + w;
    }
    if (cur) out.push(cur);
  }
  return out.join("\n") || text;
}

async function run(args: string[], timeoutMs = 120000): Promise<void> {
  await exec(FFMPEG, args, { timeout: timeoutMs, maxBuffer: 1 << 26 });
}

// drawtext with a fade-in. Expressions hold commas/parens so they're single-
// quoted inside the filter (ffmpeg parses those, not the shell).
function drawtext(textfile: string, fontsize: number, color: string, yExpr: string, start = 0): string {
  return `drawtext=fontfile=${FONT}:textfile=${textfile}:fontcolor=${color}` +
    `:fontsize=${fontsize}:line_spacing=18:x='(w-text_w)/2':y='${yExpr}'` +
    `:alpha='min(max(t-${start},0)/0.35,1)'`;
}

async function textScene(text: string, out: string, w: number, h: number, d: number, tmp: string, idx: number, bg: string, fontsize: number) {
  const tf = path.join(tmp, `text${idx}.txt`);
  await writeFile(tf, wrap(text, fontsize, w));
  const y = "(h-text_h)/2+20*(1-min(t/0.35,1))"; // fade-in + 20px settle
  await run(["-y", "-f", "lavfi", "-i", `color=c=${ffColor(bg)}:s=${w}x${h}:d=${d}:r=30`,
    "-vf", drawtext(tf, fontsize, textColor(bg), y), "-c:v", "libx264", "-pix_fmt", "yuv420p", out]);
}

async function imageScene(sc: any, out: string, w: number, h: number, d: number, tmp: string, idx: number): Promise<boolean> {
  try {
    const r = await fetch(sc.image_url, { redirect: "follow" });
    if (!r.ok) return false;
    const img = path.join(tmp, `img${idx}.bin`);
    await writeFile(img, Buffer.from(await r.arrayBuffer()));
    const frames = Math.floor(d * 30);
    let vf = `scale=${w * 2}:-2,zoompan=z='min(zoom+0.0012,1.18)':d=${frames}` +
      `:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h}:fps=30`;
    const cap = (sc.caption || "").trim();
    if (cap) {
      const tf = path.join(tmp, `cap${idx}.txt`);
      await writeFile(tf, wrap(cap, 56, w));
      vf += "," + drawtext(tf, 56, "white", `h-text_h-${Math.floor(h * 0.09)}`);
    }
    await run(["-y", "-loop", "1", "-t", String(d), "-i", img, "-vf", vf, "-c:v", "libx264", "-pix_fmt", "yuv420p", out]);
    return true;
  } catch { return false; }
}

async function logoScene(sc: any, out: string, w: number, h: number, d: number, tmp: string, logoUrl: string, brandTag: string, bg: string) {
  const text = [sc.tagline || brandTag, sc.cta].filter((x: string) => x && x.trim()).join("\n");
  let logo = "";
  if (logoUrl) {
    try {
      const r = await fetch(logoUrl, { redirect: "follow" });
      if (r.ok) { logo = path.join(tmp, "logo.png"); await writeFile(logo, Buffer.from(await r.arrayBuffer())); }
    } catch { logo = ""; }
  }
  const color = textColor(bg);
  if (logo) {
    let filt = `[1:v]scale=${Math.floor(w * 0.28)}:-1[lg];[0:v][lg]overlay='(W-w)/2':'(H-h)/2-${Math.floor(h * 0.14)}'[base]`;
    const cmd = ["-y", "-f", "lavfi", "-i", `color=c=${ffColor(bg)}:s=${w}x${h}:d=${d}:r=30`, "-i", logo];
    if (text) {
      const tf = path.join(tmp, "logotext.txt"); await writeFile(tf, wrap(text, 54, w));
      filt += `;[base]${drawtext(tf, 54, color, `(h-text_h)/2+${Math.floor(h * 0.10)}`, 0.3)}[v]`;
      cmd.push("-filter_complex", filt, "-map", "[v]");
    } else cmd.push("-filter_complex", filt, "-map", "[base]");
    cmd.push("-c:v", "libx264", "-pix_fmt", "yuv420p", out);
    await run(cmd);
  } else {
    await textScene(text || "Find out more", out, w, h, d, tmp, 99, bg, 72);
  }
}

// Render a storyboard to an mp4 Buffer (+ a poster jpg Buffer).
export async function renderStoryboard(storyboard: Storyboard, brand: { colors?: string[]; logo?: string; name?: string } = {}, aspect: "9:16" | "16:9" = "9:16"): Promise<{ video: Buffer; poster: Buffer; seconds: number }> {
  const scenes = (storyboard?.scenes || []).slice(0, 10);
  if (!scenes.length) throw new Error("storyboard has no scenes");
  if (!FFMPEG) throw new Error("ffmpeg not available");
  const [w, h] = aspect === "16:9" ? [1920, 1080] : [1080, 1920];
  const valid = (brand.colors || []).filter((c) => /^#?[0-9a-fA-F]{6}$/.test(c || "")).map((c) => "#" + c.replace("#", ""));
  const palette: string[] = [];
  for (const c of (valid.length ? valid : FALLBACK_BG).slice(0, 3)) { palette.push(c); palette.push("#0b0b0f"); }
  try { await chmod(FFMPEG, 0o755); } catch { /* binary may already be +x */ }
  const tmp = await mkdtemp(path.join(os.tmpdir(), "motion_"));
  try {
    const clips: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const sc: any = scenes[i];
      let kind = (sc.type || "text").toLowerCase();
      const d = dur(sc.seconds);
      const out = path.join(tmp, `scene${i}.mp4`);
      if (kind === "image" && sc.image_url) {
        const ok = await imageScene(sc, out, w, h, d, tmp, i);
        if (!ok) kind = "text";
      }
      if (kind === "logo") {
        await logoScene(sc, out, w, h, d, tmp, brand.logo || "", "", "#0b0b0f");
      } else if (kind === "text") {
        const bg = palette[i % palette.length];
        const base = aspect === "9:16" ? 100 : 88;
        const size = Math.floor(base * ((sc.style || "").toLowerCase() === "hook" ? 1.25 : 1.0));
        await textScene(sc.text || sc.caption || "", out, w, h, d, tmp, i, bg, size);
      }
      clips.push(out);
    }
    const listfile = path.join(tmp, "list.txt");
    await writeFile(listfile, clips.map((c) => `file '${c}'`).join("\n"));
    const final = path.join(tmp, "final.mp4");
    await run(["-y", "-f", "concat", "-safe", "0", "-i", listfile, "-c:v", "libx264",
      "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", final], 180000);
    const poster = path.join(tmp, "poster.jpg");
    await run(["-y", "-i", final, "-ss", "0.6", "-frames:v", "1", poster]);
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
        `- first scene {"type":"text","text":"<a punchy hook, <=6 words>","style":"hook","seconds":2}\n` +
        `- 2-4 {"type":"text","text":"<one short line, <=7 words>","seconds":1.8} message beats\n` +
        `- last {"type":"logo","tagline":"<3-5 word payoff>","cta":"<short CTA>","seconds":2.4}\n` +
        `Punchy, concrete, human. Each line stands alone on screen.`,
    });
    const j = extractJson(out);
    if (Array.isArray(j.scenes) && j.scenes.length) return { scenes: j.scenes };
  } catch { /* fall through */ }
  // Deterministic fallback from the copy.
  const lines = String(opts.copy || "").split(/[.!?\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const scenes: Scene[] = lines.map((t, i) => ({ type: "text", text: t, style: i === 0 ? "hook" : undefined, seconds: 1.8 }));
  scenes.push({ type: "logo", tagline: opts.brand?.name || "", cta: opts.cta || "", seconds: 2.4 });
  return { scenes };
}

// Upload bytes to Supabase Storage, return the public URL (null if no DB).
async function upload(bytes: Buffer, ext: string, ctype: string): Promise<string> {
  const c = db();
  if (!c || !bytes.length) return "";
  try {
    try { await c.storage.createBucket(BUCKET, { public: true }); } catch { /* exists */ }
    const tag = Math.abs(bytes.length * 2654435761 % 1e9).toString(36) + bytes.length.toString(36);
    const p = `motion/${tag}.${ext}`;
    const { error } = await c.storage.from(BUCKET).upload(p, bytes, { contentType: ctype, upsert: true });
    if (error) return "";
    return c.storage.from(BUCKET).getPublicUrl(p).data.publicUrl;
  } catch { return ""; }
}

// The motion_video render path used by lib/media-gen: storyboard -> render ->
// store. Returns { url, stillUrl } like the other renderers.
export async function renderMotionVideo(opts: { copy: string; intent?: string; brand?: { name?: string; voice?: string; colors?: string[]; logo?: string }; cta?: string; aspect?: "9:16" | "16:9"; apiKey?: string }): Promise<{ url: string; stillUrl: string; seconds: number }> {
  const storyboard = await buildMotionStoryboard(opts);
  const { video, poster, seconds } = await renderStoryboard(storyboard, opts.brand || {}, opts.aspect || "9:16");
  const url = await upload(video, "mp4", "video/mp4");
  const stillUrl = poster.length ? await upload(poster, "jpg", "image/jpeg") : "";
  if (!url) throw new Error("motion video render produced no storable url (Supabase storage required)");
  return { url, stillUrl: stillUrl || url, seconds };
}
