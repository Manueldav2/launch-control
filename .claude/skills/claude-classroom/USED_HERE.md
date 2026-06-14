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

**How we used it on Launch Control:** multiple sessions ran in parallel — one drove
the whole UI (landing, console, sidebar, glass), others built backend/data (auth,
quota, Supabase store, channels). We coordinated through the board: declared
ownership, claimed files, posted a shared backlog, and synced every commit so the
sessions didn't fight the same files.

To run it yourself: `node .claude/skills/claude-classroom/classroom.js enroll` (or
install it as a Claude Code skill). See SKILL.md for the full protocol.
