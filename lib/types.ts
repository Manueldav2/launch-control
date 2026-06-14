// The contract for the whole engine. The week plan is the core artifact.
import type { VisualVerdict } from "./visual-critic";
import type { CompetitiveVerdict } from "./critic";
import type { CompetitorPost } from "./bright-data";

export type Platform = "x" | "linkedin" | "instagram";
export const PLATFORMS: Platform[] = ["x", "linkedin", "instagram"];

export type ContentType = "text" | "image" | "ugc_video" | "motion_video";

// One platform's slot on a given day.
export interface ContentSlot {
  platform: Platform;
  // What this post is trying to make the reader feel/do (the per-platform reaction).
  reaction: string;
  contentType: ContentType;
  // The drafted copy (caption / post body / on-screen line).
  copy: string;
  // For video/image slots: the prompt the media engine should render from.
  mediaPrompt?: string;
  // Filled in once media is generated (a public URL).
  mediaUrl?: string;
  // Critic verdict, set by the self-grading pass.
  grade?: SlotGrade;
  // Visual critic verdict for the rendered media (set by the optional visual pass).
  visualGrade?: VisualVerdict;
  // Competitive critic verdict for the COPY — how it stacks up against real peer
  // posts (Bright Data). Set only when competitor posts were mined; comparedTo===0
  // means the comparison was skipped (no competitor signal).
  competitive?: CompetitiveVerdict;
  // Competitive critic verdict for the rendered MEDIA, same shape/semantics.
  visualCompetitive?: CompetitiveVerdict;
}

export interface SlotGrade {
  pass: boolean;
  failures: string[]; // which rubric checks failed (empty if pass)
}

export interface DayPlan {
  day: number; // 1-7
  weekday: string; // "Monday" ...
  // The single call-to-action shared across every platform that day.
  cta: string;
  // The narrative beat of the day (what the day is about in the arc).
  theme: string;
  // True for the event day (e.g. the Saturday beach cleanup) the week builds toward.
  isEventDay: boolean;
  // Set by the weather decision (a rain-or-shine / backup line shown as a ribbon).
  weatherNote?: string;
  slots: ContentSlot[];
}

export interface WeekInputs {
  goal: string; // what we're trying to accomplish
  cta: string; // the overall call to action
  website: string; // the nonprofit / brand site to research and stay on-brand to
  eventWeekday?: string; // when the headline event happens (default "Saturday")
  // OPTIONAL peer/competitor profile URLs (X / LinkedIn / Instagram) to mine for
  // the CTA + hook patterns that actually win. Requires BRIGHT_DATA_API_KEY;
  // ignored (and the engine behaves exactly as before) when unset.
  competitors?: string[];
  // When no `competitors` are supplied, automatically RESEARCH and find them
  // (lib/research.ts discoverCompetitors). Defaults to ON; set false to opt out.
  // No-op without BRIGHT_DATA_API_KEY.
  autoCompetitors?: boolean;
  // The in-person event location ("Ocean Beach, San Francisco"). Empty or "NA"
  // means there is no physical place — the CTA points to the website instead.
  location?: string;
}

// True when this launch is a real "go somewhere" event (location is set and not NA).
export function isEventMode(inputs: { location?: string }): boolean {
  const l = (inputs.location || "").trim().toLowerCase();
  return !!l && l !== "na" && l !== "n/a" && l !== "none" && l !== "online";
}

// Open-Meteo forecast for the event day + the engine's recommendation. Drives the
// weather decision Gen UI for go-to-place events.
export interface WeatherWatch {
  location: string;     // the resolved place we forecasted for
  eventDate: string;    // ISO date (YYYY-MM-DD) of the event
  weekday: string;      // "Saturday"
  condition: string;    // human label: "Heavy rain", "Clear", ...
  precipProb: number;   // 0-100 chance of precipitation
  tempMaxC: number;
  windMaxKmh: number;
  isBad: boolean;       // outdoor-event-unfriendly forecast
  severe: boolean;      // thunderstorm/snow/extreme — gathering is risky
  summary: string;      // one-line human read of the day
  recommendation: "reschedule" | "rain_plan" | "proceed";
  rainPlanNote?: string;        // the rain-or-shine line to add if they keep the day
  altDay?: { weekday: string; date: string; condition: string; precipProb: number };
}

// A created Luma event for an event-mode launch.
export interface LumaEvent {
  id: string;
  url: string;
  name: string;
  startAt: string;     // ISO
  timezone: string;
  description: string; // markdown description the engine wrote
}

export interface BrandContext {
  name: string;
  mission: string;
  voice: string;
  colors: string[];
  logo?: string; // logo/brand-mark URL pulled from the site
  summary: string; // one paragraph the model distilled from the site
}

export interface WeekPlan {
  inputs: WeekInputs;
  brand: BrandContext;
  playbook?: string; // the researched "what wins" intel that shaped the plan
  competitorIntel?: string; // real peer CTA/hook patterns mined via Bright Data (optional)
  // The competitor profile URLs the critics benchmarked against — whether
  // hand-entered or AUTO-DISCOVERED (lib/research.ts). Surfaced so the UI can show
  // who was found. Empty/absent unless Bright Data is configured.
  competitors?: string[];
  // The raw top peer posts (per platform) the critics compared our content
  // against — the benchmark behind every slot's `competitive` verdict. Empty/
  // absent unless Bright Data is configured AND competitors were supplied/found.
  competitorPosts?: CompetitorPost[];
  days: DayPlan[];
  weather?: WeatherWatch | null; // set for go-to-place events
  luma?: LumaEvent | null;       // set once a Luma event is created
  createdAt: string;
}
