// Luma connect + event creation.
//   GET  -> verify the pasted API key works (powers the Connect button).
//   POST -> for an event-mode launch, write a warm event description with Claude,
//           geocode the place for its timezone, and create a real Luma event.
// The Luma key comes from the UI (x-luma-key header or body.lumaKey) — Luma has
// no OAuth, so "connect" is a key the user pastes once.
import { NextRequest, NextResponse } from "next/server";
import { createLumaEvent, verifyLumaKey } from "@/lib/luma";
import { geocodePlace, nextDateFor } from "@/lib/weather";
import { ask, extractJson } from "@/lib/llm";

export const maxDuration = 120;

function lumaKey(req: NextRequest, body?: any): string {
  return req.headers.get("x-luma-key") || body?.lumaKey || process.env.LUMA_API_KEY || "";
}

export async function GET(req: NextRequest) {
  const key = lumaKey(req);
  if (!key) return NextResponse.json({ connected: false });
  return NextResponse.json({ connected: await verifyLumaKey(key) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const key = lumaKey(req, body);
    if (!key) return NextResponse.json({ error: "Connect a Luma account first." }, { status: 400 });

    const { goal, cta, website, location, eventWeekday = "Saturday", brand = {}, coverUrl } = body;
    if (!location) return NextResponse.json({ error: "location required for a Luma event" }, { status: 400 });
    const anthropicKey = req.headers.get("x-anthropic-key") || body.apiKey || undefined;

    // Geocode for timezone + coordinate (best-effort).
    const geo = await geocodePlace(location);
    const timezone = geo?.timezone || "America/New_York";
    const eventDate = nextDateFor(eventWeekday);
    const startAt = `${eventDate}T10:00:00`;   // naive local; Luma applies `timezone`
    const endAt = `${eventDate}T12:00:00`;

    // Name + description, grounded in the real brand + goal + place. No AI-tells.
    let name = `${brand.name || "Community"} event`;
    let description = "";
    try {
      const out = await ask({
        apiKey: anthropicKey,
        maxTokens: 700,
        system:
          "You write warm, specific event pages for nonprofits and community causes. " +
          "Never use em-dashes, hype words (delve, unlock, seamless, game-changer), fake " +
          "statistics, or invented quotes. Plain, human, local.",
        user:
          `Return JSON {"name":"<short event title, <=60 chars>","description_md":"<markdown, 120-180 words>"}.\n\n` +
          `ORG: ${brand.name || ""}\nMISSION: ${brand.mission || ""}\nVOICE: ${brand.voice || ""}\n` +
          `GOAL: ${goal || ""}\nLOCATION: ${location}\nWHEN: ${eventWeekday} at 10am\n` +
          `DETAILS/RSVP: ${cta || ""} ${website || ""}\n\n` +
          "Make a local person want to show up: what it is, who it's for, what to bring, why " +
          "it matters here, how to find the spot. End with one line to RSVP. No em-dashes.",
      });
      const j = extractJson(out);
      if (j.name) name = String(j.name).slice(0, 80);
      if (j.description_md) description = String(j.description_md);
    } catch { /* fall back to a minimal event */ }

    const result = await createLumaEvent({
      apiKey: key,
      name,
      startAt,
      endAt,
      timezone,
      descriptionMd: description || `${goal || name}\n\nWhere: ${location}\nDetails: ${website || ""}`,
      location,
      coordinate: geo ? { latitude: geo.lat, longitude: geo.lon } : undefined,
      coverUrl: typeof coverUrl === "string" && coverUrl.startsWith("http") ? coverUrl : undefined,
    });

    return NextResponse.json({
      id: result.id, url: result.url, name, startAt, timezone, description,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
