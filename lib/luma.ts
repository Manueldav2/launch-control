// Luma: spin up a real event page for an event-mode launch. Auth is an API key
// (x-luma-api-key) the user pastes once — Luma has no third-party OAuth. The
// create endpoint returns only an id, so we fetch the event back to get its
// public URL. Geo is best-effort: if Luma rejects the address shape we retry
// without it so the event still gets created.
const BASE = "https://public-api.luma.com";

function headers(apiKey: string): Record<string, string> {
  return { "x-luma-api-key": apiKey, "Content-Type": "application/json" };
}

export interface CreateLumaInput {
  apiKey: string;
  name: string;
  startAt: string;           // ISO 8601
  endAt?: string;            // ISO 8601
  timezone: string;          // IANA, e.g. "America/Los_Angeles"
  descriptionMd?: string;
  location?: string;         // free-text address for geo_address_json
  coordinate?: { latitude: number; longitude: number };
  coverUrl?: string;
  meetingUrl?: string;       // for online events
}

export interface CreateLumaResult {
  id: string;
  url: string;               // public lu.ma URL (best-effort)
}

// Verify a key works (used by the connect button). Cheap call that 401s on a bad key.
export async function verifyLumaKey(apiKey: string): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/v1/user/get-self`, { headers: headers(apiKey) });
    return r.ok;
  } catch { return false; }
}

async function postCreate(apiKey: string, body: Record<string, unknown>): Promise<string> {
  const r = await fetch(`${BASE}/v1/events/create`, {
    method: "POST", headers: headers(apiKey), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`luma create ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const id = j.id || j.api_id || j.event?.api_id;
  if (!id) throw new Error("luma: event created but no id returned");
  return id as string;
}

// Resolve the public URL for an event id. Luma's get returns the slug in `url`.
async function resolveUrl(apiKey: string, id: string): Promise<string> {
  try {
    const r = await fetch(`${BASE}/v1/event/get?api_id=${encodeURIComponent(id)}`, { headers: headers(apiKey) });
    if (!r.ok) return "";
    const j = await r.json();
    const ev = j.event || j;
    const u: string = ev.url || ev.geo_address_json?.url || "";
    if (!u) return "";
    return u.startsWith("http") ? u : `https://lu.ma/${u}`;
  } catch { return ""; }
}

export async function createLumaEvent(input: CreateLumaInput): Promise<CreateLumaResult> {
  const base: Record<string, unknown> = {
    name: input.name,
    start_at: input.startAt,
    timezone: input.timezone,
  };
  if (input.endAt) base.end_at = input.endAt;
  if (input.descriptionMd) base.description_md = input.descriptionMd;
  if (input.coverUrl) base.cover_url = input.coverUrl;
  if (input.meetingUrl) base.meeting_url = input.meetingUrl;

  const withGeo: Record<string, unknown> = { ...base };
  if (input.location) {
    withGeo.geo_address_json = { type: "manual", address: input.location };
    if (input.coordinate) withGeo.coordinate = input.coordinate;
  }

  let id: string;
  try {
    id = await postCreate(input.apiKey, withGeo);
  } catch (e) {
    // Most likely the geo shape was rejected — retry with the plain event so we
    // still create something real rather than failing the whole launch.
    if (input.location) id = await postCreate(input.apiKey, base);
    else throw e;
  }
  const url = await resolveUrl(input.apiKey, id);
  return { id, url };
}

const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// The soonest date that falls on `weekday`, at a default 10:00 local start, as
// an ISO string plus the matching IANA timezone (resolved from the host machine
// is wrong for the event — caller passes the timezone we geocoded).
export function nextEventStartISO(weekday: string, hour = 10): string {
  const target = WD.findIndex((d) => d.toLowerCase() === weekday.trim().toLowerCase());
  const base = new Date();
  base.setHours(hour, 0, 0, 0);
  if (target >= 0) {
    const delta = (target - base.getDay() + 7) % 7;
    base.setDate(base.getDate() + delta);
  }
  return base.toISOString();
}
