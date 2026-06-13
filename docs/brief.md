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

## What "done" means (verifiable by the model, no human)
- `/api/generate-week` returns a plan where every slot has `grade.pass === true`.
- The scorecard reads `passing === total`.
- The deployed URL responds 200 and renders the week.
See `rubric.md` for the exact checks the critic grades against.

## Rerun it on anything tomorrow
Change the three inputs. A food drive, a 5k, a product launch. Same engine,
same rubric, same done-check. Nothing about the pipeline is cleanup-specific.
