# Architecture

```
            ┌──────────────────────────────────────────────┐
  inputs →  │  /api/generate-week                           │
 goal,cta,  │   1. fetch + research site   (Opus 4.8)       │
 website    │   2. plan 7-day arc → event  (Opus 4.8)       │
            │   3. write per-channel copy  (Opus 4.8)       │
            │   4. CRITIC grades each slot (gradeSlot)      │
            │   5. regenerate failures     (Opus 4.8)       │
            └───────────────┬──────────────────────────────┘
                            │ WeekPlan (all slots green)
                            ▼
   /api/generate-media  ──► fal.ai (image / UGC / motion video)   [cached, $-capped]
   /api/connect         ──► Zernio hosted OAuth (X / LinkedIn / IG)
   /api/publish         ──► Zernio publish or schedule
   /api/comments        ──► Zernio comments → Opus reply draft → optional post
```

## The image critic (decoupled review lane)

Media generation writes each render to Supabase Storage + an `assets` row with
`status='pending_review'`. A **separate** consumer — the image critic — claims
those rows, LOOKS at the image (Opus vision), and writes back a verdict
(`approved` / `rejected` / `regenerated`). The two sides share only the table
contract, never code, so the generator can be built independently against it.

```
  generator ──▶ Storage + assets(status=pending_review)
                          │  claim_next_asset()  (FOR UPDATE SKIP LOCKED — many reviewers safe)
                          ▼
   npm run review ──► claim ─▶ look at image (Opus vision, or header heuristic w/o key)
                          └─▶ write status + review jsonb  ──▶ generator renders v+1 on `regenerated`
```

- `lib/review/contract.ts` — the typed table contract + status lifecycle.
- `lib/review/client.ts` — Supabase queue ops (guarded by `claimed_by`).
- `lib/review/critic.ts` — vision + heuristic backends; the verdict mapping
  (version-bounded regenerate loop).
- `lib/review/{reviewer,worker}.ts` — one unit of work; the poll loop.
- `scripts/review-worker.ts` — `npm run review` CLI. `app/api/review` — serverless tick + queue stats.
- Full contract: `docs/review-contract.md`. Schema: `docs/supabase-schema.sql`.

## Modules
- `lib/anthropic.ts` — research, plan generation, the critic (`gradeSlot`),
  and the copy-fixer (`fixSlotCopy`). Default model `claude-opus-4-8`.
- `lib/fal.ts` — image + video via fal queue API. Per-prompt cache + a
  process-wide spend ceiling (`MAX_VIDEO_SPEND_USD`).
- `lib/zernio.ts` — connect, list accounts, publish, list/reply comments.
- `lib/cache.ts` — disk cache (`.cache/`, gitignored). First run generates,
  every rerun is instant and free.
- `lib/types.ts` — the `WeekPlan` contract.

## Why it's safe to share
No secrets in the repo. All keys live in `.env.local` (gitignored); see
`.env.example` for the names. The `.cache/` directory is gitignored too.

## Connecting to the parent product later
The engine is self-contained. The plan generator + critic + media + Zernio
clients port cleanly into a larger agent (the "connect to Parry later" path).
