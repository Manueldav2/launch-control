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
