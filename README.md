# Launch Control

[![verify](https://github.com/Manueldav2/launch-control/actions/workflows/verify.yml/badge.svg)](https://github.com/Manueldav2/launch-control/actions/workflows/verify.yml)

**One idea in. A whole week of on-brand launch content out, written, made, and graded by a swarm of Claude agents.**

Built for Claude Build Day. Give it a goal, a call to action, and a nonprofit's
website. A swarm of Opus 4.8 agents researches the brand, plans a 7-day content
arc that crescendos to the event (e.g. a Saturday beach cleanup), writes the copy
for X / LinkedIn / Instagram, renders the images and UGC/launch videos, and
**grades its own work against a rubric, regenerating anything that fails** before
a word goes out. Connect your socials through Zernio and approve each post or
auto-post the whole week. Agents watch the comments and reply in your voice.

See [`docs/brief.md`](docs/brief.md) and [`docs/rubric.md`](docs/rubric.md).

## What's new vs. off-the-shelf
- The agents **grade themselves** against a fixed rubric and regenerate failures.
  "Done" is verifiable by the model, no human: every slot green + the URL responds.
- It doesn't stop at content. It **ships and works the comments**.
- It reruns on any campaign by changing three inputs.

## Orchestration in one breath

```
one planner → one critic loop (grade → fix → re-grade, every slot in parallel)
            → one rubric (docs/rubric.md) → one done-check
```

Two zero-dependency scripts make the orchestration simple, repeatable, and
verifiable by the model with no human:

```bash
# rerun the engine on ANY campaign — swap the three inputs
node scripts/launch.mjs --goal "..." --cta "..." --website "https://..."

# "done" = one command, one exit code: rubric tests + URL 200 + scorecard green
node scripts/verify.mjs --url <deployed-url> --run --goal "..." --cta "..." --website "..."
```

`docs/rubric.md` is the single contract — the critic enforces it, the offline test
suites (`lib/*.test.ts`, no API key) prove it, and `verify.mjs` (+ CI on every
push) checks it. Rerun on a new problem tomorrow by changing three strings.

## Run it

```bash
cp .env.example .env.local   # fill in ANTHROPIC_API_KEY, FAL_KEY, ZERNIO_API_KEY
npm install
npm run dev                  # http://localhost:3000
```

Enter a goal, a CTA, and a nonprofit website, then **Generate the week**. The
plan returns with a green scorecard. Click "Make image / video" on any media
slot to render it (cached + spend-capped). Connect socials and publish.

## Keys (never committed)
| Env | What |
|-----|------|
| `ANTHROPIC_API_KEY` | Claude (Opus 4.8): research, planning, copy, the critic |
| `FAL_KEY` | fal.ai: images, UGC video, motion/launch video |
| `ZERNIO_API_KEY` | Zernio: connect + publish to X / LinkedIn / Instagram |

All secrets live in `.env.local` (gitignored). Only `.env.example` (names, no
values) is in the repo.

## Cost
Video is the expensive part. Renders are cached per prompt, and a process-wide
ceiling (`MAX_VIDEO_SPEND_USD`, default $20) hard-stops runaway spend. Claude
runs on Build Day credits.

## Stack
Next.js 15 (App Router, TypeScript) · Anthropic SDK (Opus 4.8) · fal.ai · Zernio.

## Layout
```
app/          UI + API routes (generate-week, generate-media, connect, publish, comments)
lib/          anthropic (brains + critic), fal (media), zernio (social), cache, types
docs/         brief.md, rubric.md, architecture.md
```

## Multi-agent coordination (a tool we brought, not built here)

We ran this build with several Claude Code sessions working in parallel, coordinated
by **Claude Classroom** — a multi-agent coordination skill we built **earlier, at
home** (not during Build Day). It gives a shared board, file claims, negotiation,
delegation, and a pre-commit guard so parallel sessions never clobber each other.
We vendored it at [`.claude/skills/claude-classroom/`](.claude/skills/claude-classroom/)
so the workflow is reproducible; see its [`USED_HERE.md`](.claude/skills/claude-classroom/USED_HERE.md)
for provenance and how we used it here.
