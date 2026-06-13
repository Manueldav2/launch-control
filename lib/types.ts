// The contract for the whole engine. The week plan is the core artifact.
import type { VisualVerdict } from "./visual-critic";

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
  slots: ContentSlot[];
}

export interface WeekInputs {
  goal: string; // what we're trying to accomplish
  cta: string; // the overall call to action
  website: string; // the nonprofit / brand site to research and stay on-brand to
  eventWeekday?: string; // when the headline event happens (default "Saturday")
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
  days: DayPlan[];
  createdAt: string;
}
