# Brief — Launch Control

**One sentence in, a posted launch week out.** Give the engine a goal, a call to
action, a website, and (for in-person events) a location. A crew of Opus 4.8
agents researches the brand, plans a 7-day arc, writes every post in the brand
voice, renders the images / UGC / launch films, grades and rewrites itself until
the week is clean, checks the weather, can spin up a Luma event, and publishes
across X, LinkedIn, Instagram, and TikTok. Live: https://launch-control-phi.vercel.app

## Impact — who benefits and why it matters
A small nonprofit driving turnout to a Saturday event (a beach cleanup, a food
drive, a home build) needs a strategist, three channel writers, a designer, and a
video editor. They have none of that, so the week goes quiet and the room is
half-empty. Launch Control gives that team a full week of on-brand, multi-platform
content, the media to go with it, and the posting, in minutes. It is built for the
organizations with the most at stake and the least capacity. Nothing in the
pipeline is cleanup-specific: change the four inputs and it plans a product launch,
a 5k, or a fundraiser just as well (the acceptance harness proves this on a fresh
problem every run).

## Demo — what holds up live
- Type one goal, watch the crew plan, write, and self-grade a 7-day week (21 slots).
- The week is grounded in the org's REAL brand: name, voice, and colors scraped
  from their site, woven into copy and media.
- Event mode: the copy speaks to the LOCAL audience to drive turnout, a **weather
  watch** forecasts the event day and, if it looks bad, asks what to do
  (reschedule, add a rain plan, or proceed), and a **Luma event** is created with a
  written description.
- Render images, UGC video, and motion launch films; each render persists to
  Supabase Storage and is handed to the review queue.
- One control routes every piece to the right channels and **publishes/schedules
  the whole week** across X, LinkedIn, Instagram, and TikTok (verified: a real
  image post landed on X with its media).

## Opus 4.8 — beyond a basic integration
Opus is the whole crew, not a single call: the **strategist** (7-day arc), the
**self-grading critic** that rewrites any slot failing a rubric and retries until
the week is green, a **multimodal visual critic** that looks at rendered frames and
judges on-brand / on-intent, **brand research** that distills voice + palette from
raw site HTML, **weather-aware** event decisions, and a **fabrication-grounding**
rule that keeps the copy honest (no invented numbers or quotes). The self-grade is
the product surface, not a hidden step.

## Orchestration — repeatable and model-verifiable
"Done" is graded by the model, no human:
- `scripts/verify.mjs` hits the live URL and grades the whole system against
  `docs/rubric.md` (deployment up, 4 channels connectable, a 7-day week that
  self-grades green, brand researched, copy localized, zero AI-tells, weather
  attached, media renders + persists, routing correct). Exit 0 = accepted.
- It defaults to a **fresh problem** (a Habitat home build in Atlanta), so a green
  run is evidence the engine generalizes, and any team can rerun it tomorrow on a
  new problem: `node scripts/verify.mjs --goal "..." --cta "..." --website "..." --location "..."`.
- The media create→review→regenerate loop has its own end-to-end check:
  `node scripts/selftest-media-pipeline.mjs`.
- Clean lane split: **creation** (plan, write, render, route, publish) and
  **review** (claim, judge, regenerate) meet at one contract — a `pending_review`
  asset row plus three REST calls, so either side is swappable.
