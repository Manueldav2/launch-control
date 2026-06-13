// Media engine: images + UGC/motion video via fal.ai's queue API.
// Cost guard + cache: video is the expensive part, so every render is cached
// by prompt and a process-wide spend ceiling (MAX_VIDEO_SPEND_USD) hard-stops
// runaway spend during a demo.
import { cacheGet, cacheSet, cacheKey } from "./cache";

const BASE = "https://queue.fal.run";
// Rough per-render cost estimates (USD) for the spend guard.
const VIDEO_COST = 0.4;
const IMAGE_COST = 0.01;

function key(): string {
  const k = process.env.FAL_KEY;
  if (!k) throw new Error("FAL_KEY is not set");
  return k;
}
function ceiling(): number {
  return parseFloat(process.env.MAX_VIDEO_SPEND_USD || "20");
}

let spent = 0; // process-lifetime estimate; cached renders don't add to it.
export function spentSoFar(): number {
  return Math.round(spent * 100) / 100;
}

async function falRun(model: string, input: Record<string, unknown>): Promise<any> {
  const sub = await fetch(`${BASE}/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (![200, 201, 202].includes(sub.status)) throw new Error(`fal submit ${sub.status}: ${await sub.text()}`);
  const j = await sub.json();
  const statusUrl = j.status_url;
  const responseUrl = j.response_url;
  if (!statusUrl) return j; // some models return inline
  const deadline = Date.now() + 6 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const st = await (await fetch(statusUrl, { headers: { Authorization: `Key ${key()}` } })).json();
    if (st.status === "COMPLETED")
      return (await fetch(responseUrl, { headers: { Authorization: `Key ${key()}` } })).json();
    if (st.status === "FAILED" || st.status === "CANCELLED") throw new Error(`fal ${st.status}`);
  }
  throw new Error("fal render timed out");
}

export async function generateImage(prompt: string): Promise<string> {
  const k = cacheKey(["img", prompt, process.env.FAL_IMAGE_MODEL]);
  const hit = cacheGet<string>(k);
  if (hit) return hit;
  const model = process.env.FAL_IMAGE_MODEL || "fal-ai/flux/dev";
  const out = await falRun(model, { prompt, image_size: "square_hd" });
  const url = out?.images?.[0]?.url || "";
  if (url) {
    spent += IMAGE_COST;
    cacheSet(k, url);
  }
  return url;
}

export async function generateVideo(prompt: string, imageUrl?: string): Promise<string> {
  const k = cacheKey(["vid", prompt, imageUrl || "", process.env.FAL_VIDEO_MODEL]);
  const hit = cacheGet<string>(k);
  if (hit) return hit;
  if (spent + VIDEO_COST > ceiling())
    throw new Error(`video spend ceiling reached ($${ceiling()}); skipping render`);
  const model = process.env.FAL_VIDEO_MODEL || "fal-ai/veo3.1/fast/image-to-video";
  const input: Record<string, unknown> = imageUrl ? { prompt, image_url: imageUrl } : { prompt };
  const out = await falRun(model, input);
  const url = out?.video?.url || out?.video_url || "";
  if (url) {
    spent += VIDEO_COST;
    cacheSet(k, url);
  }
  return url;
}
