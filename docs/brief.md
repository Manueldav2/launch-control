# Brief — Launch Control

## The problem
A small nonprofit (a food drive, a beach cleanup) needs a week of social content
to drive turnout to one event. Doing it well means a strategist, three channel
writers, a designer, and a video editor. They have none of that. So the week
goes quiet and the event is under-attended.

## What we built (hackathon day)
Give the engine three inputs:
1. **What you're trying to accomplish** (the goal)
2. **Your call to action** (what people should do)
3. **The nonprofit's website** (to research and stay on-brand)

A swarm of Claude (Opus 4.8) agents then:
1. **Researches** the site and distills the brand (name, mission, voice, colors).
2. **Plans a 7-day arc** that crescendos to the event day (e.g. Saturday cleanup).
   Each day has ONE shared call-to-action across every platform, and each
   platform (X, LinkedIn, Instagram) targets a distinct reaction.
3. **Writes the copy** for every slot, channel-appropriate, in the brand voice.
4. **Renders the media** — images, UGC video (person-to-camera invite), and a
   motion launch video — via fal.ai, cached and spend-capped.
5. **Grades itself** — a critic agent checks every slot against `rubric.md`
   (no AI-tells, no fabrication, CTA present, length limits, media has a prompt)
   and **regenerates any slot that fails** until the week is green.
6. **Ships it** — connect X / LinkedIn / Instagram through Zernio, then approve
   each piece or flip "auto-post the whole week."
7. **Works the comments** — watches each post and drafts (optionally posts)
   in-voice replies.

## Who it's for
Any nonprofit or small team that needs to fill a room and has nobody to run the
content. Weeks of work, done in minutes, on-brand, and verified before it ships.

## What "done" means — verifiable by the model, no human
`done` is three machine checks, collapsed into one command and one exit code:

```
node scripts/verify.mjs --url <deployed-url> --run \
     --goal "..." --cta "..." --website "https://..."
```

It exits non-zero unless ALL of:
1. **Rubric tests pass** — `lib/*.test.ts` assert every check in `rubric.md`
   (copy #1–6 + visual V0–V3), offline, no API key. Run on its own,
   `node scripts/verify.mjs` checks just this: a zero-setup proof the rubric holds.
2. **The URL responds 200.**
3. **The scorecard reads `passing === total`** — every slot, copy and media,
   passed its own critic.

`rubric.md` is the single contract: the critic enforces it, the tests prove it,
`verify.mjs` checks it.

## Rerun it on any problem tomorrow — one command
```
node scripts/launch.mjs --goal "..." --cta "..." --website "https://..."
```
Swap the three inputs and the same engine, rubric, and done-check run on a new
campaign — zero code changes:
- `--goal "Pack 10,000 meals" --cta "Claim a shift" --website "https://foodbank.org"`
- `--goal "Sell out our 5k" --cta "Grab a bib" --website "https://run.org"`
- `--goal "Launch the v2 app" --cta "Join the waitlist" --website "https://acme.com"`

Nothing about the pipeline is cleanup-specific.

## Orchestration in one breath
One planner → one critic loop (grade → fix → re-grade, every slot in parallel) →
one rubric (`rubric.md`) → one done-check (`verify.mjs`). Start the app
(`npm run dev`), then `launch.mjs` runs a campaign and `verify.mjs` proves it's
done. Another team reruns it tomorrow by changing three strings.

> The two scripts run with plain `node` (zero deps). For `npm test` /
> `npm run launch` / `npm run verify`, add to `package.json` (build-agent lane):
> `"test": "tsx --test lib/*.test.ts"`, `"launch": "node scripts/launch.mjs"`,
> `"verify": "node scripts/verify.mjs"`.
