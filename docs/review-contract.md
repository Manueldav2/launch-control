# The review contract (creation ⇄ critic)

The **generator** (creation side) and the **image critic** (review side) are
fully decoupled. They share exactly one thing: the `assets` table in Supabase.
Neither imports the other's code. The generator builds against this contract;
the critic (`lib/review/*`, `scripts/review-worker.ts`, `app/api/review`) is a
pure consumer of it.

```
 generator                          Supabase: assets table                    image critic
 ─────────                          ──────────────────────                    ────────────
 render image ──▶ Storage("media")
 insert row   ──▶  status=pending_review ───────────────────────▶ claim_next_asset(p_reviewer)
                                          ◀─────────────────────── status=reviewing, claimed_by=me
                                                                    look at the image (vision)
 read verdict ◀──  status ∈ {approved,            ◀─────────────── write status + review jsonb
                            rejected, regenerated}
 (on regenerated: render v+1, parent_id=old.id, status=pending_review)
```

## The table: `assets`

Columns the **critic reads** (the generator must populate the image-locating
ones and ideally `prompt`/`intent`/`brand_colors` so the critic can judge well):

| column         | type          | meaning |
|----------------|---------------|---------|
| `id`           | uuid (pk)     | row id |
| `org`          | text          | workspace/user handle |
| `content_type` | text          | `image` \| `ugc_video` \| `motion_video` |
| `public_url`   | text          | **the image to inspect** (public `media` bucket) |
| `poster_url`   | text          | video keyframe fallback |
| `source_url` / `url` | text    | further fallbacks |
| `storage_path` | text          | object key in the `media` bucket |
| `prompt`       | text          | the generation prompt (the intent) |
| `intent`       | text          | what the slot is trying to say/show (optional) |
| `brand_colors` | jsonb (string[]) | brand palette, for the on-brand check |
| `version`      | int           | render version (1-based) |

Columns the **critic writes** (and the generator reads):

| column       | type        | written by critic |
|--------------|-------------|-------------------|
| `status`     | text        | `reviewing` on claim, then a terminal verdict |
| `claimed_by` | text        | the reviewer id that owns the row |
| `claimed_at` | timestamptz | when it was claimed |
| `review`     | jsonb       | the structured critique (shape below) |
| `updated_at` | timestamptz | bumped on every write |

The critic **never** inserts rows and **never** writes to Storage — producing
the next version after a `regenerated` verdict is the generator's job.

### The producer half (this repo's reference implementation)

The partner owns creation, but this repo ships a faithful producer against the
same contract so the loop is demonstrable end-to-end here:

- `lib/storage.ts` — `uploadImageFromUrl(sourceUrl, path)` copies a render into
  the public `media` bucket (`org/<plan|adhoc>/<slot>/vN-<hash>.jpg`) and returns
  the permanent public URL.
- `lib/store.ts` — `enqueueForReview(input)` uploads the inspectable still, then
  inserts an `assets` row with `status='pending_review'` + `prompt`/`intent`/
  `brand_colors`/`version`/`storage_path`/`public_url`/`source_url`.
- `POST /api/generate-media` with `{ enqueue: true }` renders → uploads →
  enqueues in one call (off by default; the demo flow is unchanged otherwise).
- `npm run review:e2e` proves the whole creation→queue→review loop against the
  live DB (uploads, enqueues, reviews, then cleans up after itself).

The producer touches ONLY Storage + the table; the reviewer reads ONLY the
table. Neither imports the other — that's the decoupling.

## Status lifecycle

```
pending_review ──claim──▶ reviewing ──verdict──▶ approved      (ship it)
      ▲                            ├──────────▶ rejected      (discard; do not retry)
      │                            └──────────▶ regenerated   (generator renders v+1)
      └─────────── stale claim (claimed_at older than REVIEW_CLAIM_TTL_MS) requeued ─┘
```

- **approved** — the image matches intent and is clean. Ship it.
- **rejected** — unusable, or it has failed too many times (`version >= REVIEW_MAX_VERSIONS`). Give up.
- **regenerated** — this version is no good but a fresh render could fix it. The
  generator should render `version + 1` with `parent_id = <this row id>` and
  `status = pending_review`. The version cap bounds the loop so it can't run forever.

## Claiming (the atomicity guarantee)

The critic claims via the partner's RPC **`claim_next_asset(p_reviewer text, p_org text default null)`**,
which does `FOR UPDATE SKIP LOCKED` in the database — so any number of reviewer
instances can run and no two will ever claim the same row. If that RPC is ever
absent, the critic falls back to a pure optimistic-concurrency claim (a guarded
`UPDATE ... WHERE status='pending_review'`, which PostgREST runs as a single
locking statement, so exactly one racer wins). Every verdict/release write is
additionally guarded by `claimed_by = me`, so a reviewer can only ever finish a
row it still owns.

## The `review` jsonb shape (`ReviewRecord`)

```jsonc
{
  "verdict": "approved | rejected | regenerated",
  "pass": true,
  "matchesIntent": true,        // does it show what the prompt described
  "onBrand": true,              // fits the brand palette / feel
  "clean": true,                // no garbled text, melted faces, artifacts, watermark
  "issues": ["short, concrete problems"],
  "notes": "one line for the maker / a hint for the next render",
  "score": 0.95,                // 0..1 overall quality
  "reviewer": "critic-local-1", // which reviewer instance judged it
  "method": "vision | heuristic",
  "model": "claude-opus-4-8",   // null when method=heuristic
  "reviewedAt": "2026-06-13T22:03:37.937Z",
  "inspectedUrl": "https://…/media/…/v1-fd9d78d9.jpg"
}
```

`method` is `vision` when an Anthropic key is configured (Opus actually looks at
the image); it degrades to `heuristic` (header decode, dimensions, blank/format
sanity) when no key is present, so the pipeline still runs. The reviewer never
silently approves on an API error — a failed vision call falls back to the
heuristic rather than rubber-stamping.

## Running the critic

```bash
npm run review                 # poll forever, drain the queue
npm run review:once            # one batch then exit (cron/CI)
npm run review -- --heuristic  # no Anthropic key — header-only inspection
curl -XPOST localhost:3000/api/review        # serverless tick
curl localhost:3000/api/review               # queue snapshot
```

Config (env, see `.env.example`): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
`ANTHROPIC_API_KEY`, `REVIEWER_ID`, `REVIEW_MAX_VERSIONS`, `REVIEW_POLL_MS`,
`REVIEW_CLAIM_TTL_MS` (default 5 min — longer than a vision critique),
`REVIEW_ORG`, `REVIEW_CRON_SECRET` (optional auth for `POST /api/review`).
