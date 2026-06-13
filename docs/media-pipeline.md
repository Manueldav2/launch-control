# Media Pipeline — how a render becomes a reviewed, shippable asset

This is the contract between **creation** (fal.ai renders, owned here) and
**review** (the visual critic + regenerate loop, owned by the partner). They are
fully decoupled: creation writes an artifact into Supabase, review consumes it.
Neither side calls the other's code.

```
 plan + execute
      │  renderMedia()  (lib/media-gen.ts — fal.ai, branded prompt)
      ▼
 fal CDN url ──► persist bytes to Supabase Storage  (bucket "media")
      │                                   │ permanent public_url
      ▼                                   ▼
 INSERT into assets  status = 'pending_review'   ◄── the queue / the contract
      │
      ▼   (the seam — three REST calls, language-agnostic)
 ┌──────────────────────── partner's review session ───────────────────────┐
 │ GET  /api/review/next         claim the oldest pending asset             │
 │   → play public_url, look at poster_url, read prompt/intent/brand_colors │
 │ POST /api/review/:id/verdict  { pass, verdict }  → approved | rejected   │
 │ POST /api/review/:id/regenerate { prompt }  → fal re-render, new version │
 └──────────────────────────────────────────────────────────────────────────┘
      │ loop until a version passes
      ▼
 status = 'approved'  ──►  Asset Bay shows it  ──►  Zernio publishes it
```

## The artifact: one row in `assets`

A render is a self-describing artifact. Everything a reviewer needs to **judge**
and **regenerate** lives on the row — no re-deriving brand, prompt, or intent.

| column | meaning |
|---|---|
| `id` | uuid |
| `org` | workspace/user handle (default `demo`) |
| `plan_id` | the `plans` row this slot belongs to (nullable for ad-hoc renders) |
| `slot` | `"<day>:<platform>"`, e.g. `"3:instagram"` — ties back to the WeekPlan slot |
| `content_type` | `image` \| `ugc_video` \| `motion_video` |
| `platform`, `day`, `brand`, `caption` | slot context |
| `prompt` | the exact media prompt rendered from (regen starts here) |
| `intent` | what the slot is trying to show (the critic judges against this) |
| `brand_colors` | `jsonb` string[] — the palette baked into the render |
| `location` | locale grounding (event mode), nullable |
| `source_url` | the raw fal CDN url (not permanent) |
| `storage_path` | path in the `media` bucket |
| `public_url` | **permanent** Supabase Storage url — this is what plays/ships |
| `poster_url` | keyframe still (the frame the vision model looks at) |
| `status` | `pending_review` \| `in_review` \| `approved` \| `rejected` \| `regenerating` |
| `version` | 1, 2, 3… |
| `parent_id` | the lineage root — every regen of the same slot shares it |
| `review` | `jsonb` — the partner's `VisualVerdict`, written back on verdict |
| `claimed_by`, `claimed_at` | set on claim so two reviewers never double-process |
| `created_at`, `updated_at` | |

`url` (the legacy column) mirrors `public_url` (falls back to `source_url` if
storage is unavailable) so the existing gallery keeps working.

## The three endpoints (the seam)

### `GET /api/review/next?reviewer=<id>&org=<org>`
Atomically **claims** the oldest `pending_review` asset (Postgres
`FOR UPDATE SKIP LOCKED` via the `claim_next_asset` RPC), flips it to
`in_review`, stamps `claimed_by`/`claimed_at`, and returns the full row.
Returns `{ asset: null }` when the queue is empty. Safe to poll from N parallel
reviewers — each gets a distinct asset.

### `POST /api/review/:id/verdict`
Body: `{ "pass": boolean, "verdict": <VisualVerdict json> }`.
Sets `status` to `approved` (pass) or `rejected` (fail) and stores `verdict` in
`review`. This is the terminal call for an asset the reviewer accepts or kills.

### `POST /api/review/:id/regenerate`
Body: `{ "prompt"?: string, "intent"?: string }`.
Marks the asset `regenerating`, **re-renders via fal.ai** with the adjusted
prompt (same branding/locale logic as the first cut), persists the new bytes,
and inserts a **child** row (`version+1`, `parent_id` = lineage root,
`status='pending_review'`). The reviewer then claims the child and judges again.
The fal key and prompt logic stay on this side — the reviewer only sends the
adjustment.

## Reading assets

`GET /api/assets?org=<org>&status=<status>` — the Asset Bay reads this. Pass
`status=approved` to show only shippable media; omit `status` for everything.
Returns `{ db: boolean, assets: [...] }`. `db:false` means no Supabase
configured (the app falls back to localStorage + render urls).

## Storage

Bytes live in a public Supabase Storage bucket named `media` (override with
`SUPABASE_MEDIA_BUCKET`). Path: `<org>/<plan_id|adhoc>/<slot>/v<version>.<ext>`.
The bucket is created on first write if it doesn't exist. fal CDN urls are
long-lived but not forever; the Supabase copy is the permanent, shippable one.

## Graceful degradation

No `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` → every pipeline function is a no-op
that returns the fal url as before. The review endpoints report the queue is
empty. The app never errors because the DB is absent. Set the keys and the whole
review lifecycle turns on with zero code changes — exactly like `lib/store.ts`
today.

## Spend guard

Every fal call (first render **and** every regenerate) is capped by
`MAX_VIDEO_SPEND_USD` and cached per prompt, so a runaway review loop can't burn
the budget.
