# Launch Rubric — how "done" is graded without a human

Two layers, both machine-checkable: the **per-slot copy rubric** the critic grades
every post against, and the **project acceptance rubric** the harness
(`scripts/verify.mjs`) grades the whole system against a live URL.

## Per-slot copy rubric (the self-grading critic)

`gradeSlot` + `gradeSlotLLM` (`lib/critic.ts`) run on every content slot. A slot
must pass ALL checks or `fixSlotCopy` rewrites it; the loop retries up to 3x, so
the week converges to all-green. The week is "done" only when every slot passes.
Each check is a hard binary so the model can grade it without a human.

| # | Check | Pass condition |
|---|-------|----------------|
| 1 | No AI-tells | Copy contains none of the dash family (em-dash `—`, en-dash `–`, horizontal bar `―`) or the phrase blocklist. The canonical list is `AI_TELLS` in `lib/critic.ts` — e.g. "delve", "game-changer", "unlock the", "unleash", "elevate your", "supercharge", "seamless", "it's not just", "more than just", "dive into", "leverage", "thrilled to announce". Edit the array, not this row. |
| 2 | Channel length | X copy is <= 280 characters |
| 3 | Not empty | Copy is >= 10 characters of real content |
| 4 | Media has direction | image / ugc_video / motion_video slots carry a concrete `mediaPrompt` |
| 5 | No fabrication | No invented statistic, count, dollar figure, quote, or claim not grounded in the site (Opus LLM check). The planner is also instructed never to invent specifics, so this rarely fires. |
| 6 | CTA present | The day's shared call-to-action is woven into the copy (Opus LLM check) |

Checks 1-4 are deterministic; 5-6 are an Opus grading pass per slot. Every failing
slot is rewritten and re-graded up to three times before the week is reported.

## Project acceptance rubric (the whole system)

`scripts/verify.mjs --live` (or `--url <base>`) hits a live deployment and grades
these as hard binaries. Exit 0 only when every check passes. The live run defaults
to a *fresh* problem (a Habitat home build in Atlanta) so a green run proves the
engine generalizes. (Bare `node scripts/verify.mjs` runs only the offline gate-1
rubric tests — that is the keyless check CI runs on every push.)

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

The deterministic half is provable with **no API key**: `npx tsx --test
lib/critic.test.ts` runs one failing case per rubric item (1-4) plus the
fabrication/CTA parse guard, and exits non-zero on any regression.
```
node scripts/verify.mjs                                  # gate 1: rubric tests, offline, no key (CI)
node scripts/verify.mjs --live                           # + full acceptance vs the deployed URL
node scripts/verify.mjs --live --goal "..." --cta "..." --website "https://..." --location "Austin, TX"
node scripts/verify.mjs --url http://localhost:3000      # + acceptance vs a local dev server
```
A green run (exit 0) is the acceptance test. Swap the inputs to grade any
campaign. The media create→review→regenerate loop has its own end-to-end check:
`node scripts/selftest-media-pipeline.mjs` (render → enqueue → claim → verdict → gallery).

# Visual Rubric — what the visual critic grades every render against

The text rubric above grades the *copy*. This second rubric grades the *media*.
The visual critic (`critiqueVisual` in `lib/visual-critic.ts`) runs the
multimodal model over each rendered still/keyframe — an `image`, or the keyframe
behind a `ugc_video` / `motion_video` — when `review=true` on
`POST /api/generate-media`. It grades what it SEES, not the prompt. Each check is
a hard binary.

| # | Check | Pass condition |
|---|-------|----------------|
| V0 | Rendered | (Deterministic, no model) the slot produced a usable media URL. `gradeRender` hard-fails an empty/unfetchable render *before* any vision call is spent. |
| V1 | Matches intent | The render actually shows what the slot's prompt/intent describes (`matchesIntent`). **Hard fail.** |
| V2 | Clean | No garbled/misspelled text, melted hands/faces, watermark, or obvious AI artifacts (`clean`). **Hard fail.** |
| V3 | On-brand | Fits the brand palette/feel (`onBrand`). **Advisory** — a strong signal, but not a hard fail: a clean, on-topic render still ships if the palette is only slightly off. |

A render **passes** iff `matchesIntent && clean` (V1 ∧ V2); `onBrand` is reported
but never blocks. This is exactly the rule in `parseVisualVerdict`.

## How "done" is verified without a human
1. `POST /api/generate-media { contentType, prompt, review: true, intent, brandColors }`
   returns `visualGrade: { pass, matchesIntent, onBrand, clean, issues, notes }`.
2. A render is green when `visualGrade.pass === true`.
3. The verdict logic is **provable with no API key**: `npx tsx --test
   lib/visual-critic.test.ts` exercises `parseVisualVerdict` (the pass rule, the
   fail-closed handling of missing fields, string-boolean tolerance, JSON-in-prose
   extraction, issue-clamping) and `gradeRender`, and exits non-zero on any
   regression — the visual analog of `lib/critic.test.ts`.

**Fail-closed by design:** a verdict field the model omits or garbles counts as a
FAIL, so a broken review can never silently ship a bad image. Only an
*infrastructure* failure (network / API / unparseable reply) is non-blocking —
`critiqueVisual` surfaces that as a skipped review so the pipeline never hangs on
the critic.
