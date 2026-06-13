# Launch Rubric — what the critic grades every slot against

The critic (`gradeSlot` in `lib/critic.ts`) runs on every content slot. A
slot must pass ALL checks or it gets regenerated. The week is "done" only when
every slot passes. Each check is a hard binary so the model can grade it without
a human.

| # | Check | Pass condition |
|---|-------|----------------|
| 1 | No AI-tells | Copy contains none of the dash family (em-dash `—`, en-dash `–`, horizontal bar `―`) or the phrase blocklist. The canonical list is `AI_TELLS` in `lib/critic.ts` — e.g. "delve", "game-changer", "unlock the", "unleash", "elevate your", "supercharge", "seamless", "it's not just", "more than just", "dive into", "leverage", "thrilled to announce". Edit the array, not this row. |
| 2 | Channel length | X copy is <= 280 characters |
| 3 | Not empty | Copy is >= 10 characters of real content |
| 4 | Media has direction | image / ugc_video / motion_video slots carry a concrete `mediaPrompt` |
| 5 | No fabrication | No invented statistic, client, quote, or claim not grounded in the site (LLM check, layered on) |
| 6 | CTA present | The day's shared call-to-action is woven into the copy (LLM check, layered on) |

## How "done" is verified without a human
1. `POST /api/generate-week` returns `scorecard: { total, passing, fixed }`.
2. The run is green when `passing === total`.
3. The deployed app URL returns HTTP 200 and renders the 7 days.

Checks 1-4 are deterministic and ship today. Checks 5-6 are the LLM critic
extension (same loop, an Opus grading pass per slot).

The deterministic half is provable with **no API key**: `npx tsx --test
lib/critic.test.ts` runs one failing case per rubric item (1-4) plus the
fabrication/CTA parse guard, and exits non-zero on any regression.

## Reproduce
```
POST /api/generate-week
{ "goal": "...", "cta": "...", "website": "https://..." }
```
A passing response is the acceptance test. Swap the inputs to grade any campaign.
