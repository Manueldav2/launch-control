// ── THE REVIEW CONTRACT ──────────────────────────────────────────────────────
// The creation side (the generator) and the review side (this critic) are fully
// decoupled: they share ONLY this table contract, never each other's code. The
// generator writes the image to Supabase Storage + an `assets` row with
// status='pending_review'; this reviewer claims pending rows, looks at the
// image, and writes a terminal verdict back into the same row. That's the whole
// interface. See docs/review-contract.md for the prose version.
//
// Lifecycle of a row's `status`:
//
//   pending_review ──claim──▶ reviewing ──verdict──▶ approved
//                                       ├──────────▶ rejected
//                                       └──────────▶ regenerated  (asks for v+1)
//        ▲                                  │
//        └────────── stale claim re-queued ─┘  (reviewer crashed mid-review)
//
// The reviewer ONLY mutates rows it has claimed, and only ever sets these
// statuses + the `review` jsonb + `claimed_by`/`claimed_at`. It never inserts
// rows and never touches Storage — producing the next version on `regenerated`
// is the generator's job (it owns creation).

export const STATUS = {
  /** Generator just wrote the asset; waiting for a reviewer to pick it up. */
  PENDING: "pending_review",
  /** A reviewer has claimed the row and is looking at the image right now. */
  REVIEWING: "reviewing",
  /** Verdict: the image is good — ship it. */
  APPROVED: "approved",
  /** Verdict: the image is bad and not worth another roll — discard it. */
  REJECTED: "rejected",
  /** Verdict: this version is no good; the generator should render version+1. */
  REGENERATED: "regenerated",
} as const;

export type AssetStatus = (typeof STATUS)[keyof typeof STATUS];

/** The three statuses a reviewer is allowed to write as a final verdict. */
export const TERMINAL_STATUSES: AssetStatus[] = [
  STATUS.APPROVED,
  STATUS.REJECTED,
  STATUS.REGENERATED,
];

// One row of the `assets` queue. Only the fields the reviewer reads/writes are
// modelled strictly; the rest of the generator's columns ride along untyped.
export interface AssetRow {
  id: string;
  org: string;
  content_type: string; // "image" | "ugc_video" | "motion_video"
  status: AssetStatus | string;
  version: number;
  parent_id: string | null;

  // Where the bytes live (public `media` bucket). public_url is directly
  // fetchable; storage_path is the object key; poster_url is a keyframe/still
  // for video. We critique the first of these that resolves to an image.
  public_url: string | null;
  storage_path: string | null;
  poster_url: string | null;
  source_url: string | null;
  url: string | null;

  // What the critic needs to judge "matches intent / on-brand".
  prompt: string | null; // the generation prompt
  intent: string | null; // what the slot is trying to say/show
  brand_colors: string[] | null;
  caption: string | null;
  platform: string | null;
  location: string | null;

  // Claim bookkeeping.
  claimed_by: string | null;
  claimed_at: string | null;
  review: ReviewRecord | null;
  created_at: string;
  updated_at: string;
}

// What the reviewer writes into the `review` jsonb column. Structured so the
// generator (and a human) can act on it: the verdict, the per-axis findings,
// the concrete issues, and provenance (which reviewer, which model, when).
export interface ReviewRecord {
  verdict: "approved" | "rejected" | "regenerated";
  pass: boolean;
  // Per-axis judgement from the visual critic.
  matchesIntent: boolean;
  onBrand: boolean;
  clean: boolean;
  // Concrete, short problems the maker can act on.
  issues: string[];
  // One line for the maker / next regeneration prompt hint.
  notes: string;
  // 0..1 overall confidence/quality from the critic (heuristic gives a coarse one).
  score: number;
  // Provenance.
  reviewer: string; // REVIEWER_ID
  method: "vision" | "heuristic"; // which backend judged it
  model: string | null; // e.g. "claude-opus-4-8" when method=vision
  reviewedAt: string; // ISO timestamp
  // Which image URL was actually inspected.
  inspectedUrl: string | null;
}

/** The columns the reviewer selects (keep payloads small + explicit). */
export const REVIEW_SELECT =
  "id,org,content_type,status,version,parent_id,public_url,storage_path," +
  "poster_url,source_url,url,prompt,intent,brand_colors,caption,platform," +
  "location,claimed_by,claimed_at,review,created_at,updated_at";

/** Best image URL to inspect for a row, in order of preference. */
export function bestImageUrl(row: AssetRow): string | null {
  return (
    row.public_url ||
    row.poster_url || // video keyframe
    row.source_url ||
    row.url ||
    null
  );
}
