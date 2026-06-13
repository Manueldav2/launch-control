// lib/rubric.test.ts — DRIFT GUARD. docs/rubric.md is the single contract the
// critic grades against; this test proves the FILE and the CODE can't silently
// diverge. If the rubric advertises an AI-tell the critic no longer catches, or
// the documented visual pass rule stops matching parseVisualVerdict, this goes
// red. Offline, no API key — it rides through scripts/verify.mjs and CI.
//
//   npx tsx --test lib/rubric.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { findAiTells } from "./critic";
import { parseVisualVerdict } from "./visual-critic";

const RUBRIC = readFileSync(fileURLToPath(new URL("../docs/rubric.md", import.meta.url)), "utf8");

// #1 — every AI-tell the rubric quotes BY EXAMPLE must still be caught by the
// code. Subset check only (the doc says "e.g."), so adding tells to the code
// never breaks this — only dropping an advertised one does.
test("rubric.md's example AI-tells are all still caught by findAiTells", () => {
  const row = RUBRIC.split("\n").find((l) => /AI-tell/i.test(l)) || "";
  const examples = [...row.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(examples.length >= 5, `expected several quoted example tells in rubric.md row #1, found ${examples.length}`);
  for (const ex of examples) {
    assert.ok(findAiTells(`a line that says ${ex} here`).length > 0, `rubric.md advertises "${ex}" but findAiTells no longer catches it`);
  }
});

// #1 — the rubric must point at the canonical source, not a hand-copied list.
test("rubric.md names lib/critic.ts AI_TELLS as the canonical source", () => {
  assert.match(RUBRIC, /AI_TELLS/);
  assert.match(RUBRIC, /lib\/critic\.ts/);
});

// Visual — the documented pass rule (V1 ∧ V2; onBrand advisory, never blocks)
// must match parseVisualVerdict's behavior across EVERY combination.
test("visual pass rule behaves as the documented matchesIntent ∧ clean", () => {
  for (const matchesIntent of [true, false])
    for (const clean of [true, false])
      for (const onBrand of [true, false]) {
        const v = parseVisualVerdict(JSON.stringify({ matchesIntent, clean, onBrand, issues: [] }));
        assert.equal(v.pass, matchesIntent && clean, `mi=${matchesIntent} clean=${clean} onBrand=${onBrand}`);
      }
});

// Visual — and the doc must actually STATE that rule, so reader and code agree.
test("rubric.md documents the matchesIntent ∧ clean pass rule", () => {
  assert.match(RUBRIC, /matchesIntent/);
  assert.ok(
    /matchesIntent\s*&&\s*clean/.test(RUBRIC) || /V1\s*[∧&]+\s*V2/.test(RUBRIC),
    "rubric.md should state the pass rule as `matchesIntent && clean` (or V1 ∧ V2)",
  );
});
