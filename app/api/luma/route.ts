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
import { db } from "@/lib/store";

export const maxDuration = 120;

function lumaKey(req: NextRequest, body?: any): string {
  return req.headers.get("x-luma-key") || body?.lumaKey || process.env.LUMA_API_KEY || "";
}

export async function GET(req: NextRequest) {
  const key = lumaKey(req);
  let events: any[] = [];
  try {
    const c = db();
    if (c) {
      const { data } = await c.from("luma_events").select("id, name, url, start_at, timezone, location").order("created_at", { ascending: false }).limit(50);
      events = (data || []).map((e: any) => ({ id: e.id, name: e.name, url: e.url, startAt: e.start_at, timezone: e.timezone, location: e.location }));
    }
  } catch { /* best-effort */ }
  return NextResponse.json({ connected: !!key, events });
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
    // Luma requires a full ISO datetime WITH a timezone offset (a naive local time
    // is rejected as "Invalid ISO datetime"). Compute the offset for the event's
    // timezone on that date (handles DST).
    const offsetFor = (d: string) => {
      try {
        const name = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "shortOffset" })
          .formatToParts(new Date(`${d}T12:00:00Z`)).find((p) => p.type === "timeZoneName")?.value || "GMT+0";
        const m = name.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
        return m ? `${m[1]}${m[2].padStart(2, "0")}:${m[3] || "00"}` : "+00:00";
      } catch { return "+00:00"; }
    };
    const startAt = `${eventDate}T10:00:00${offsetFor(eventDate)}`;
    const endAt = `${eventDate}T12:00:00${offsetFor(eventDate)}`;

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

    // Persist so it shows up under "Your events" (Luma's own list API is scope-
    // gated; our DB is the reliable source for the in-app events page).
    try {
      const c = db();
      if (c && result.id) {
        await c.from("luma_events").upsert(
          { id: result.id, name, url: result.url, start_at: startAt, timezone, location, description, created_at: new Date().toISOString() },
          { onConflict: "id" },
        );
      }
    } catch { /* best-effort */ }

    return NextResponse.json({
      id: result.id, url: result.url, name, startAt, timezone, description,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
