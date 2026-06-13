# Launch Rubric — how "done" is graded without a human

Two layers, both machine-checkable: the **per-slot copy rubric** the critic grades
every post against, and the **project acceptance rubric** the harness
(`scripts/verify.mjs`) grades the whole system against a live URL.

## Per-slot copy rubric (the self-grading critic)

`gradeSlot` + `gradeSlotLLM` (`lib/critic.ts`) run on every content slot. A slot
must pass ALL checks or `fixSlotCopy` rewrites it; the loop retries up to 3x, so
the week converges to all-green. The week is "done" only when every slot passes.

| # | Check | Pass condition |
|---|-------|----------------|
| 1 | No AI-tells | None of: em-dash, "delve", "game-changer", "unlock", "unleash", "elevate your", "supercharge", "seamless", "it's not just", "more than just", "dive into", "leverage", "thrilled to announce" |
| 2 | Channel length | X copy <= 280 characters |
| 3 | Not empty | >= 10 characters of real content |
| 4 | Media has direction | image / ugc_video / motion_video slots carry a concrete `mediaPrompt` |
| 5 | No fabrication | No invented statistic, count, dollar figure, quote, or claim not grounded in the site (Opus LLM check). The planner is also instructed never to invent specifics, so this rarely fires. |
| 6 | CTA present | The day's shared call-to-action is woven into the copy (Opus LLM check) |

Checks 1-4 are deterministic; 5-6 are an Opus grading pass per slot. Every failing
slot is rewritten and re-graded up to three times before the week is reported.

## Project acceptance rubric (the whole system)

`scripts/verify.mjs` hits a live deployment and grades these as hard binaries.
Exit 0 only when every check passes. Defaults run a *fresh* problem (a Habitat
home build in Atlanta) so a green run proves the engine generalizes.

| Area | Check |
|------|-------|
| Demo | `GET /` returns 200 |
| Distribution | `/api/connect` offers X, LinkedIn, Instagram, TikTok; >= 1 account connected |
| Opus + Impact | `/api/generate-week` returns a 7-day, >=12-slot plan; self-grade `passing === total` |
| Grounding | Brand researched from the real site (name + colors); copy localized to the event city; zero AI-tells anywhere |
| Event mode | A weather forecast + recommendation (reschedule\|rain_plan\|proceed) attached for the in-person event |
| Media | `/api/generate-media` renders AND persists to Supabase Storage (permanent URL) |
| Routing | A no-media UGC slot routes to Instagram + TikTok and is correctly skipped (0 posts) |

## Reproduce / rerun on any problem tomorrow

```
node scripts/verify.mjs                                  # live URL, fresh default problem
node scripts/verify.mjs --goal "..." --cta "..." --website "https://..." --location "Austin, TX"
node scripts/verify.mjs --url http://localhost:3000      # against a local dev server
```

A green run (exit 0) is the acceptance test. Swap the four inputs to grade any
campaign. The media review loop has its own end-to-end check:
`node scripts/selftest-media-pipeline.mjs` (render → enqueue → claim → verdict → gallery).
