// Weather watch for go-to-place events. We forecast the event day at the event
// location (Open-Meteo, free, no API key) and decide whether the outdoor plan is
// safe, needs a rain plan, or should move to a clearer day. Powers the weather
// decision Gen UI. Nothing here fabricates: if we can't geocode or forecast, we
// return null and the UI simply doesn't show a weather card.
import type { WeatherWatch } from "./types";

const GEO = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST = "https://api.open-meteo.com/v1/forecast";

// WMO weather codes -> human label. (https://open-meteo.com/en/docs)
const WMO: Record<number, string> = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Freezing fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  56: "Freezing drizzle", 57: "Freezing drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain",
  66: "Freezing rain", 67: "Freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Rain showers", 81: "Rain showers", 82: "Heavy rain showers",
  85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm",
};

function label(code: number): string {
  return WMO[code] || "Unsettled";
}
// Real rain/snow/storm that makes an outdoor gathering unpleasant or unsafe.
const HEAVY_RAIN = new Set([61, 63, 65, 66, 67, 80, 81, 82]);
const DRIZZLE = new Set([51, 53, 55, 56, 57]); // only bad if precip% is also up
const SNOWY = new Set([71, 73, 75, 77, 85, 86]);
const STORMY = new Set([95, 96, 99]);

// Geocode a free-text place. Open-Meteo only matches clean place names, so we try
// the whole string, then comma/word variants — preferring the city that sits just
// before a 2-letter state/country code ("Ocean Beach, San Francisco, CA" -> SF).
export interface GeoHit { lat: number; lon: number; label: string; timezone: string }

export async function geocodePlace(place: string): Promise<GeoHit | null> {
  const raw = place.trim();
  if (!raw) return null;
  const segs = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const candidates: string[] = [];
  const last = segs[segs.length - 1] || "";
  if (segs.length >= 2 && last.replace(/[^a-z]/gi, "").length <= 3) {
    candidates.push(segs[segs.length - 2]); // the city before the state/country code
  }
  candidates.push(raw, ...segs, raw.replace(/,/g, " "));
  for (const w of raw.split(/\s+/)) if (w.length > 2) candidates.push(w);

  const tried = new Set<string>();
  for (const c of candidates) {
    const q = c.trim();
    if (!q || tried.has(q.toLowerCase())) continue;
    tried.add(q.toLowerCase());
    try {
      const r = await fetch(`${GEO}?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
      if (!r.ok) continue;
      const j = await r.json();
      const hit = (j.results || [])[0];
      if (hit?.latitude != null && hit?.longitude != null) {
        const parts = [hit.name, hit.admin1, hit.country_code].filter(Boolean);
        return { lat: hit.latitude, lon: hit.longitude, label: parts.join(", "), timezone: hit.timezone || "UTC" };
      }
    } catch { /* try next candidate */ }
  }
  return null;
}

const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// The soonest date (today or later) that falls on `weekday`, as YYYY-MM-DD.
export function nextDateFor(weekday: string, from = new Date()): string {
  const target = WD.findIndex((d) => d.toLowerCase() === weekday.trim().toLowerCase());
  const base = new Date(from);
  base.setHours(12, 0, 0, 0);
  if (target < 0) return base.toISOString().slice(0, 10);
  const delta = (target - base.getDay() + 7) % 7; // 0..6, includes today
  base.setDate(base.getDate() + delta);
  return base.toISOString().slice(0, 10);
}

type DailyRow = { date: string; code: number; precip: number; tmax: number; wind: number };

function badness(row: DailyRow): { isBad: boolean; severe: boolean } {
  const severe = STORMY.has(row.code) || SNOWY.has(row.code) ||
    row.precip >= 80 || row.wind >= 55 || row.tmax <= 0 || row.tmax >= 40;
  const isBad = severe || HEAVY_RAIN.has(row.code) ||
    (DRIZZLE.has(row.code) && row.precip >= 45) || row.precip >= 55 ||
    row.wind >= 45 || row.tmax >= 37 || row.tmax <= 2;
  return { isBad, severe };
}

// Forecast the event day and decide. Returns null if we can't resolve the place
// or the date is outside the 16-day forecast window (we never guess).
export async function assessEventWeather(
  location: string,
  eventWeekday = "Saturday",
): Promise<WeatherWatch | null> {
  const geo = await geocodePlace(location);
  if (!geo) return null;

  const eventDate = nextDateFor(eventWeekday);
  try {
    const url = `${FORECAST}?latitude=${geo.lat}&longitude=${geo.lon}` +
      `&daily=weather_code,temperature_2m_max,precipitation_probability_max,wind_speed_10m_max` +
      `&timezone=auto&forecast_days=16`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = (await r.json()).daily;
    if (!d?.time?.length) return null;

    const rows: DailyRow[] = d.time.map((date: string, i: number) => ({
      date,
      code: d.weather_code[i],
      precip: d.precipitation_probability_max[i] ?? 0,
      tmax: d.temperature_2m_max[i] ?? 0,
      wind: d.wind_speed_10m_max[i] ?? 0,
    }));

    const event = rows.find((row) => row.date === eventDate);
    if (!event) return null; // date beyond the forecast window
    const { isBad, severe } = badness(event);

    // Find the best clear day within the next 7 days for a possible reschedule.
    let altDay: WeatherWatch["altDay"];
    if (isBad) {
      const window = rows.filter((row) => row.date >= eventDate).slice(0, 8);
      const good = window
        .filter((row) => row.date !== eventDate && !badness(row).isBad)
        .sort((a, b) => a.precip - b.precip)[0];
      if (good) {
        altDay = { weekday: WD[new Date(good.date + "T12:00:00").getDay()], date: good.date, condition: label(good.code), precipProb: good.precip };
      }
    }

    const recommendation: WeatherWatch["recommendation"] = !isBad
      ? "proceed"
      : severe && altDay ? "reschedule" : "rain_plan";

    const condition = label(event.code);
    const tempF = Math.round(event.tmax * 9 / 5 + 32);
    const summary = isBad
      ? `${condition} expected on ${eventWeekday} (${event.precip}% rain, ~${tempF}°F, wind ${Math.round(event.wind)} km/h).`
      : `${condition} on ${eventWeekday}, ~${tempF}°F. Good day to gather.`;
    const rainPlanNote = isBad
      ? (severe
        ? `Severe weather possible. Have a covered backup and a clear safety call.`
        : `Rain or shine. Bring a poncho, we will have cover and hot drinks.`)
      : undefined;

    return {
      location: geo.label,
      eventDate,
      weekday: eventWeekday,
      condition,
      precipProb: event.precip,
      tempMaxC: Math.round(event.tmax),
      windMaxKmh: Math.round(event.wind),
      isBad,
      severe,
      summary,
      recommendation,
      rainPlanNote,
      altDay,
    };
  } catch {
    return null;
  }
}
