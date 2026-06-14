// The swarm's brain: idea + CTA + website -> a full 7-day plan, then a critic
// pass that grades every slot and regenerates any that fail. Returns a plan
// where every piece of copy has a green grade.
import { NextRequest, NextResponse } from "next/server";
import { generateWeekPlan } from "@/lib/anthropic";
import { gradeSlot, gradeSlotLLM, fixSlotCopy, compareCopyToCompetitors } from "@/lib/critic";
import { fixRender, critiqueVisual, competitiveRenderPrompt, compareVisualToCompetitors, wasReviewSkipped } from "@/lib/visual-critic";
import { generateImage } from "@/lib/fal";
import { cacheKeyFor, getCached, setCached } from "@/lib/demo-cache";
import type { WeekInputs, ContentType } from "@/lib/types";

export const maxDuration = 300;

// Bake the brand palette (+ launch-film motion) into a render prompt, mirroring
// app/api/generate-media so a still graded here matches what that route renders.
function brandedPrompt(prompt: string, colors: string[], contentType: ContentType): string {
  const pal = (colors || []).slice(0, 3);
  const palette = pal.length
    ? `\n\nBrand palette to feature naturally in the scene (signage, clothing, props, on-screen text), never as floating swatches: ${pal.join(", ")}.`
    : "";
  const motion = contentType === "motion_video"
    ? "\n\nMotion style: kinetic launch energy — punchy camera moves, quick reveals, hype-cut feel. Bold and modern."
    : "";
  return `${prompt}${palette}${motion}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<WeekInputs> & { deepReview?: boolean; renderMedia?: boolean; apiKey?: string };
    if (!body.goal || !body.cta || !body.website)
      return NextResponse.json({ error: "goal, cta, and website are required" }, { status: 400 });

    const inputs: WeekInputs = {
      goal: body.goal, cta: body.cta, website: body.website,
      eventWeekday: body.eventWeekday || "Saturday",
      competitors: body.competitors, // optional peer URLs to mine (no-op without Bright Data)
      autoCompetitors: body.autoCompetitors, // when no URLs given, auto-discover them (default on)
      location: body.location,
    };

    // Cached result for this exact brief? Serve it instantly — no auth, no LLM,
    // no critic, no media wait. This is what makes a repeated input (a demo
    // preset) load the moment anyone clicks it.
    const cacheKey = cacheKeyFor(inputs);
    const cached = await getCached<{ plan: unknown; scorecard: unknown }>(cacheKey);
    if (cached?.plan) return NextResponse.json({ plan: cached.plan, scorecard: cached.scorecard, cached: true });

    // Open access: anyone with the link can generate on the host's keys, no
    // account needed (so judges can try it). Sign-in only adds saved projects.

    // The Anthropic key may come from the UI (header or body) and overrides env.
    const apiKey = req.headers.get("x-anthropic-key") || body.apiKey || undefined;

    const plan = await generateWeekPlan(inputs, apiKey);

    // Ground the LLM critic's fabrication check in the REAL brand facts (name +
    // mission + site text). Without grounding, gradeSlotLLM can only flag
    // concrete invented specifics; with it, it judges actual groundedness.
    // NOTE: competitor intel deliberately does NOT go here — it shapes
    // generation (the plan prompt), not verification, so a peer's borrowed stat
    // can never be mistaken for a fact that's true about THIS brand.
    const grounding = [plan.brand.name, plan.brand.mission, plan.brand.summary]
      .filter(Boolean).join(". ").slice(0, 800);

    // Critic loop: grade every slot (deterministic + LLM checks), rewrite the
    // failures once, re-grade. `deep=true` adds the LLM fabrication/CTA pass.
    // Every slot is independent, so the whole critic pass runs CONCURRENTLY —
    // 21 slots graded in parallel instead of one-after-another (cold latency
    // drops from ~85s toward the cost of a single slot's grade+fix).
    // The real competitor posts (per platform) the critics compare against. Empty
    // unless Bright Data is configured AND competitors were supplied, in which
    // case every competitive pass below is a no-op and the engine runs as before.
    const peers = plan.competitorPosts || [];

    const deep = body.deepReview !== false;
    let fixed = 0;
    let copyImproved = 0; // slots a competitive comparison strengthened post-rubric
    await Promise.all(
      plan.days.flatMap((day) =>
        day.slots.map(async (slot) => {
          const det = gradeSlot(slot);
          const llm = deep ? await gradeSlotLLM(slot, day.cta, apiKey, grounding) : [];
          let failures = [...det.failures, ...llm];
          // Rewrite-and-regrade until the slot passes or we exhaust 3 attempts,
          // so the week reliably converges to all-green instead of leaving a
          // stubborn slot failing after a single try.
          let attempt = 0;
          while (failures.length && attempt < 3) {
            try {
              slot.copy = await fixSlotCopy(slot, failures, apiKey);
              const det2 = gradeSlot(slot);
              const llm2 = deep ? await gradeSlotLLM(slot, day.cta, apiKey, grounding) : [];
              failures = [...det2.failures, ...llm2];
              if (attempt === 0) fixed++;
              attempt++;
            } catch {
              break; // keep the last copy + its failing grade
            }
          }
          slot.grade = { pass: failures.length === 0, failures };

          // COMPETITIVE pass: once the copy is rubric-clean, compare it to the
          // real high-engagement peer posts for this platform. If a peer would
          // out-perform ours, do ONE suggestion-guided improvement rewrite — kept
          // only if it STILL passes the full rubric, so a competitive tweak can
          // never regress the all-green guarantee.
          if (peers.length) {
            const cmp = await compareCopyToCompetitors(slot, day.cta, peers, apiKey);
            slot.competitive = cmp;
            if (slot.grade.pass && !cmp.competitive && cmp.suggestions.length) {
              try {
                const improved = await fixSlotCopy(
                  slot,
                  ["strengthen against high-performing competitor posts"],
                  apiKey,
                  cmp.suggestions,
                );
                const cand = { ...slot, copy: improved };
                const cdet = gradeSlot(cand);
                const cllm = deep ? await gradeSlotLLM(cand, day.cta, apiKey, grounding) : [];
                if (cdet.pass && cllm.length === 0) {
                  slot.copy = improved;
                  copyImproved++;
                }
              } catch {
                /* keep the rubric-passing copy */
              }
            }
          }
        }),
      ),
    );

    // Optional VISUAL review pass (off by default so the text path stays fast).
    // The image analog of the copy loop above: render each media slot's still,
    // let the visual critic grade it, and self-correct a failing render via
    // fixRender. Only STILLS are rendered here (cheap, and the correct frame to
    // critique), so this never touches the fal video spend ceiling.
    let mediaTotal = 0, mediaPassing = 0, mediaImproved = 0;
    if (body.renderMedia) {
      const mediaSlots = plan.days.flatMap((day) =>
        day.slots.filter((s) => s.contentType !== "text" && s.mediaPrompt?.trim()));
      mediaTotal = mediaSlots.length;
      await Promise.all(
        mediaSlots.map(async (slot) => {
          try {
            const branded = brandedPrompt(slot.mediaPrompt!, plan.brand.colors, slot.contentType);
            const first = await generateImage(branded);
            const fix = await fixRender({
              imageUrl: first, prompt: branded, intent: slot.mediaPrompt!,
              brandColors: plan.brand.colors, apiKey,
            });
            slot.mediaUrl = fix.imageUrl;   // the graded still (keyframe for video slots)
            slot.visualGrade = fix.verdict;

            // COMPETITIVE visual pass: once the render is quality-clean, compare it
            // to the real peer posts for this platform. If a peer would win the
            // scroll, do ONE suggestion-guided competitive re-render — kept only if
            // it still passes the visual rubric, so it can never ship something worse.
            if (peers.length && fix.verdict.pass) {
              const cmp = await compareVisualToCompetitors({
                imageUrl: fix.imageUrl, intent: slot.mediaPrompt!, platform: slot.platform,
                peers, brandColors: plan.brand.colors, apiKey,
              });
              slot.visualCompetitive = cmp;
              if (!cmp.competitive && cmp.suggestions.length) {
                const reprompt = competitiveRenderPrompt(
                  fix.prompt, fix.attempts, cmp.suggestions, plan.brand.colors, !fix.verdict.onBrand,
                );
                const reUrl = await generateImage(reprompt);
                const reVerdict = await critiqueVisual({
                  imageUrl: reUrl, intent: slot.mediaPrompt!, brandColors: plan.brand.colors, apiKey,
                });
                // Keep the competitive re-render ONLY on a genuine pass — never on
                // critiqueVisual's fail-open "review skipped" sentinel, which would
                // otherwise swap an unverified render over the verified-good one.
                if (reVerdict.pass && !wasReviewSkipped(reVerdict)) {
                  slot.mediaUrl = reUrl;
                  slot.visualGrade = reVerdict;
                  mediaImproved++;
                }
              }
            }
          } catch {
            /* a render/critic infra failure leaves the slot ungraded, never crashes the week */
          }
        }),
      );
      mediaPassing = mediaSlots.filter((s) => s.visualGrade?.pass).length;
    }

    const total = plan.days.reduce((n, d) => n + d.slots.length, 0);
    const passing = plan.days.reduce(
      (n, d) => n + d.slots.filter((s) => s.grade?.pass).length, 0);

    // Copy scorecard is unchanged (frontend-safe); media counts are added only
    // when the visual pass ran. A week is fully green when passing===total AND
    // mediaPassing===mediaTotal.
    const scorecard: Record<string, number> = { total, passing, fixed };
    if (body.renderMedia) { scorecard.mediaTotal = mediaTotal; scorecard.mediaPassing = mediaPassing; }
    // Competitive tallies are additive and only present when we actually had peer
    // posts to benchmark against (Bright Data + competitors). copyChecked/
    // copyCompetitive = how many slots we compared and how many already held up;
    // copyImproved/mediaImproved = how many a competitive rewrite/re-render lifted.
    if (peers.length) {
      const slots = plan.days.flatMap((d) => d.slots);
      const checked = slots.filter((s) => (s.competitive?.comparedTo ?? 0) > 0);
      scorecard.competitorPosts = peers.length;
      scorecard.copyChecked = checked.length;
      scorecard.copyCompetitive = checked.filter((s) => s.competitive!.competitive).length;
      scorecard.copyImproved = copyImproved;
      if (body.renderMedia) {
        const vChecked = slots.filter((s) => (s.visualCompetitive?.comparedTo ?? 0) > 0);
        scorecard.mediaChecked = vChecked.length;
        scorecard.mediaCompetitive = vChecked.filter((s) => s.visualCompetitive!.competitive).length;
        scorecard.mediaImproved = mediaImproved;
      }
    }

    // Cache the fresh result so the next identical brief is instant for anyone.
    await setCached(cacheKey, { plan, scorecard });
    return NextResponse.json({ plan, scorecard });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
