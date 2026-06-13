# Launch Control — a Paradigm Outreach project

**One sentence in. A whole week of on-brand content out — written, filmed, graded, and posted across every channel by a swarm of Claude agents.**

Give Launch Control a goal, a call to action, and a website. A crew of Claude (Opus 4.8) agents researches the brand, plans a seven-day arc to the event, drafts every X / LinkedIn / Instagram post in the brand voice, renders stills and film, grades its own work, and schedules the week to go live.

---

## The flow

```
goal + CTA + website
  → research the brand (lib/research.ts)
  → plan the 7-day arc to the event        (Opus 4.8)
  → draft per-channel copy                  (Opus 4.8)
  → CRITIC grades each slot, rewrites misses (lib/critic.ts)
  → VISUAL CRITIC grades rendered media      (lib/visual-critic.ts)
  → WeekPlan: every slot green + a scorecard
  → render stills / UGC / motion film        (fal.ai)
  → weather watch on the event day           (Open-Meteo, keyless)
  → create the event page                    (Luma)
  → publish / schedule to channels           (Zernio)
```

## Integrations

| Service | What it does | Env key | Notes |
|---|---|---|---|
| **Claude (Opus 4.8)** | Research, the 7-day plan, per-channel copy, the text critic, and the visual critic | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | The brains. Required for a live run. Can also be pasted in-app (stored client-side, `lib/client-key.ts`). |
| **fal.ai** | Images (flux), UGC person-to-camera video, motion/launch film (veo 3.1) | `FAL_KEY`, `FAL_IMAGE_MODEL`, `FAL_VIDEO_MODEL` | Spend-guarded by `MAX_VIDEO_SPEND_USD`. Stills cheap, video metered. |
| **Zernio** | Connect + publish/schedule to X, LinkedIn, Instagram, Facebook, TikTok | `ZERNIO_API_KEY`, `ZERNIO_BASE_URL` | Powers `/channels`, `/api/connect`, `/api/publish`, `/api/posts`, comment watch. |
| **Weather (Open-Meteo)** | Forecasts the event day at the event location and decides: safe / needs a rain plan / move to a clearer day. Powers the weather-decision Gen UI. | **none — keyless** | Geocode + forecast via Open-Meteo. Returns null (no card) if it can't forecast; never fabricates. `lib/weather.ts`. |
| **Luma** | Programmatically spins up a real event page for an event-mode launch | `LUMA_API_KEY` | Single API key (Luma has no third-party OAuth), sent as `x-luma-api-key`. Paste once in `.env.local` or via the in-app Connect button. `lib/luma.ts`, `/api/luma`. |
| **Supabase** | OPTIONAL server-side persistence for rendered media + week plans (cross-device) | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_MEDIA_BUCKET` | App works fully without it (localStorage + render URLs). Run `docs/supabase-schema.sql` to enable. `lib/store.ts`, `/api/assets`. |

## App routes (`app/`)

- **`/`** — Console: the composer (mission + CTA + site) → generates and shows the readiness board + 7-day flight plan. `/?demo=1` opens a finished sample week with no API key.
- **`/landing`** — Cinematic, liquid-glass marketing hero with a Cursor-style scroll story that walks through the real components (composer → launch sequence → readiness board → flight plan).
- **`/assets`** — Asset Bay: every still/film the engine renders, filterable, downloadable.
- **`/calendar`** — The planned week as a calendar.
- **`/channels`** (+ `/channels/[platform]`) — Distribution hub: per-channel connection status, post counts, and per-platform previews.
- **`/previews`** — Per-channel post previews.
- **`/watch`** — Live view of what the crew ships.

## API routes (`app/api/`)

- `generate-week` — the swarm: idea+CTA+site → 7-day plan + critic pass + scorecard.
- `generate-media` — render one slot's image/UGC/motion (cached + spend-guarded).
- `connect` — turnkey channel connection (everything the UI needs in one GET).
- `publish` — publish/schedule to connected accounts via Zernio.
- `posts` / `comments` / `post-comments` — read posts, watch comments, draft+post auto-replies.
- `review` — critic/visual-critic pass.
- `assets` — persisted assets (Supabase when configured).
- `luma` — Luma connect + event creation.

## Library map (`lib/`)

Creation and review are split so they can be owned in parallel:
- **Creation:** `anthropic.ts` (plan + copy), `research.ts`, `media-gen.ts` + `media-pipeline.ts` + `fal.ts` (media), `channels.ts` (distribution routing), `weather.ts`, `luma.ts`, `zernio.ts`.
- **Review:** `critic.ts` (copy), `visual-critic.ts` (rendered media).
- **Plumbing:** `llm.ts` (shared Claude calls), `cache.ts` (disk cache for instant re-demos), `types.ts` (the WeekPlan contract), `store.ts` + `assets-store.ts` (server/browser persistence), `client-key.ts` + `client-luma.ts` (in-app key paste).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · `@anthropic-ai/sdk` · `@supabase/supabase-js` · framer-motion. Warm claude.ai-style light UI with liquid-glass surfaces; cinematic dark landing. Brand: Paradigm orange `#F97316`.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in the keys you have; all are optional except ANTHROPIC for a live run
npm run dev                  # http://localhost:3000
```

No keys handy? Open `/?demo=1` (or "Watch a finished sample") to see the full readiness board + flight plan instantly — no API key needed.
