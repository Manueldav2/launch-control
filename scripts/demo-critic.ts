// scripts/demo-critic.ts — the "watch the model catch its own mistakes" demo.
// Offline, NO API key: it runs the DETERMINISTIC critic (gradeSlot / findAiTells
// from lib/critic.ts) over a deliberately bad slot and narrates every rubric
// violation it catches, then shows a clean slot passing. In the full app the
// Opus critic also REWRITES the failures automatically (fixSlotCopy) and the
// visual critic grades the rendered media the same way — this is the zero-setup
// version that always works live on stage, even with no network.
//
//   npx tsx scripts/demo-critic.ts
import { gradeSlot, findAiTells } from "../lib/critic";
import type { ContentSlot } from "../lib/types";

function show(label: string, slot: ContentSlot) {
  const g = gradeSlot(slot);
  const copy = slot.copy.length > 90 ? slot.copy.slice(0, 90) + "…" : slot.copy;
  console.log(`\n${label}`);
  console.log(`  ${slot.platform} · ${slot.contentType}`);
  console.log(`  copy: ${JSON.stringify(copy)}`);
  if (g.pass) console.log("  ✅ PASS — every rubric check is green.");
  else {
    console.log(`  ❌ FAIL — the critic caught ${g.failures.length}:`);
    for (const f of g.failures) console.log(`      • ${f}`);
  }
  return g;
}

console.log("═══ Launch Control — the critic catches its own mistakes (offline, no API key) ═══");

// A draft a careless writer would ship: em-dash + a pile of hype AI-tells, over X's 280.
const bad: ContentSlot = {
  platform: "x",
  reaction: "rally",
  contentType: "text",
  copy:
    "We're thrilled to announce — it's not just a cleanup, it's a game-changer. " +
    "Delve into the seamless experience as we elevate your Saturday and supercharge the shoreline. " +
    "Unlock the magic of community and dive into impact that's more than just a beach day, because " +
    "together we can revolutionize what one volunteer morning means for this whole town, today.",
};
const g1 = show("DRAFT (what a careless writer ships):", bad);

// The rewrite target: clean, on-voice, under 280. In-app, Opus produces this.
const fixed: ContentSlot = {
  ...bad,
  copy:
    "Sat 9am: bags and gloves on us. Bring a friend, claim your stretch of sand, " +
    "and leave it better than you found it. Tag the buddy you're dragging along.",
};
const g2 = show("AFTER the fix (in-app: Opus rewrites it, then the rubric re-grades):", fixed);

// A media slot with no direction — caught deterministically too (rubric #4).
show("MEDIA slot with no prompt (rubric #4):", {
  platform: "instagram", reaction: "show", contentType: "image",
  copy: "Before/after of the beach.", mediaPrompt: "  ",
});

console.log(
  `\nThe rubric (docs/rubric.md) is the contract; this catch is 100% deterministic — ` +
    `no model call, no key. Tells caught: ${findAiTells(bad.copy).slice(0, 5).join(", ")}…`,
);
console.log("Run the full self-correcting swarm:  node scripts/launch.mjs --goal … --cta … --website …\n");

// Doubles as a smoke test: the bad slot MUST fail and the fixed slot MUST pass.
process.exit(!g1.pass && g2.pass ? 0 : 1);
