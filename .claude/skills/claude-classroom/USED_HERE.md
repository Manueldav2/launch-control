# Claude Classroom — used here, not built here

**Provenance:** Claude Classroom is a multi-agent coordination skill we built
**before** Claude Build Day, at home. It was **not** built during Build Day. We
**used** it on this project and are vendoring it into the repo so the workflow is
reproducible and credited honestly.

**What it does:** lets several Claude Code sessions work the same repo in parallel
without clobbering each other — a shared board, file **claims**, reasoned
**negotiation/contests**, **delegation**, peer detection, and a pre-commit guard
that blocks editing a file another live session holds. The engine is the
zero-dependency [`classroom.js`](./classroom.js); the agent instructions are in
[`SKILL.md`](./SKILL.md) and [`reference.md`](./reference.md).

**How we used it on Launch Control — intelligent orchestration to build fast.**
Rather than one agent grinding top to bottom, we ran a crew of sessions at once and
let the board orchestrate them:

- **Ownership-based routing.** Each session declared the area it operated, so work
  flowed to the best-fit agent: one owned the entire UI (landing, console, sidebar,
  liquid glass, the Cursor-style scroll story); others owned backend/data (auth +
  quota, the Supabase store, channels, the comment watcher).
- **Claims + a pre-commit guard.** Sessions claimed files before editing, and the
  guard refused commits to a file another live session held — so parallel work
  never clobbered, and every change fast-forwarded clean onto `main`.
- **Shared backlog + continuous sync.** Tasks were posted once and pulled by fit
  (no duplication), and every session broadcast what it shipped so the crew kept a
  live picture and rebased instantly.

The payoff: the landing, the full console (Asset Bay / Calendar / Channels), the
self-grading media pipeline, auth/quota, and every integration (Claude, fal.ai,
Zernio, Supabase, Open-Meteo, Luma) were built **in parallel, in a single day** —
the speed came from the orchestration, not from cutting corners.

To run it yourself: `node .claude/skills/claude-classroom/classroom.js enroll` (or
install it as a Claude Code skill). See SKILL.md for the full protocol.
