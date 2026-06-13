# Workflow scripts

Two zero-dependency Node scripts that make Launch Control's orchestration
**simple, repeatable, and verifiable by the model — no human in the loop.**

| Script | What it is | Run it |
|---|---|---|
| `launch.mjs` | **Rerun the engine on any campaign.** Swap three inputs, get a graded 7-day week, exit `0` only when every slot passes the rubric. | `node scripts/launch.mjs --goal "..." --cta "..." --website "https://..."` |
| `verify.mjs` | **The "done" gate.** Runs the rubric test suites + checks the URL is 200 + (opt) a real run grades green. One command, one exit code. | `node scripts/verify.mjs [--url <base>] [--run --goal .. --cta .. --website ..]` |
| `demo-critic.ts` | **Offline self-grading demo** — runs the deterministic critic over a deliberately bad slot and narrates what it catches, then a clean slot passing. No key, no network: a stage demo that always works. | `npx tsx scripts/demo-critic.ts` |

`launch.mjs` + `verify.mjs` are the workflow scripts (the Orchestration story); `demo-critic.ts` is a zero-setup live demo of the critic catching its own mistakes.

Both talk to a running app (`npm run dev`, default `http://localhost:3000`), so
the planner, the critic loop, and `docs/rubric.md` are the **same code the
product runs** — no duplicated orchestration. `launch.mjs` and `verify.mjs --run`
need an Anthropic key (`ANTHROPIC_API_KEY` or `--key`); `verify.mjs` with no
flags needs neither — it just proves the rubric tests pass.

## The loop

```
one idea ──▶ launch.mjs ──▶ /api/generate-week ──▶ plan → critic grade → fix → re-grade
                                                          │ (every slot, in parallel)
                                                          ▼
                                              scorecard: passing / total
            verify.mjs ──▶ rubric tests (lib/*.test.ts, offline) ✓
                           URL 200 ✓
                           scorecard passing === total ✓   ──▶ exit 0 = DONE
```

`--help` on either script prints full usage.
