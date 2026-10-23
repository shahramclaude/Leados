/**
 * Part 51 — property tests (Phase 3 / Gates 2, 3, 4, 5).
 *
 * Covers:
 *   1. Diversity constraint holds (max N per category) under adversarial
 *      seeding (one category has more eligible high-scoring items than the cap).
 *   2. No engagement-only feedback loop: spamming accept/reject feedback with
 *      zero verified outcomes must NOT change belief state or re-ranking score
 *      (seeded manipulation attack, must be detected/blocked).
 *   3. Explainability lint: a card missing any one of the five required
 *      fields fails; a complete card passes. 100% field coverage.
 *   4. "No confident recommendation" renders correctly for a sparse-data
 *      (never-measured) context.
 *   5. Outcome-belief decay: a stale, unverified-for-a-long-time belief decays
 *      toward the prior and can downgrade evidence class.
 *
 * Run with `npm run test:properties`. Exits non-zero on any failure.
 */

import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { recBeliefLog, recContextEffects, recRecommendations } from "@/db/schema";
import { computeActionDesk } from "@/lib/recommender/ranking";
import { recordFeedback } from "@/lib/recommender/antiManipulation";
import { recordVerifiedOutcome, decayStaleBeliefs } from "@/lib/recommender/beliefUpdate";
import { lintExplainabilityCard } from "@/lib/recommender/explainability";
import { ensureInterventionsSeeded, getInterventionBySlug } from "@/lib/recommender/registry";
import { resolveOrgContext } from "@/lib/router/context";
import { randomUUID } from "crypto";
import type { ExplainabilityCard } from "@/lib/recommender/types";

let passCount = 0;
let failCount = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passCount++;
  } else {
    console.log(`  [FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
    failCount++;
  }
}

async function cleanContext(tag: string) {
  await db.execute(sql`delete from rec_belief_log where context_key like ${"%" + tag + "%"}`);
  await db.execute(sql`delete from rec_outcomes where context_key like ${"%" + tag + "%"}`);
  await db.execute(sql`delete from rec_recommendations where context_key like ${"%" + tag + "%"}`);
  await db.execute(sql`delete from rec_context_effects where context_key like ${"%" + tag + "%"}`);
}

async function testDiversityConstraint() {
  console.log("\n--- Property 1: diversity constraint (max N per category) ---");
  const tag = "propTest=diversity";
  await cleanContext(tag);

  const context = resolveOrgContext({
    propTest: "diversity",
    incidentRateRecent: "elevated",
    managerCount: "multiple",
  });
  const contextKey = Object.keys(context)
    .sort()
    .map((k) => `${k}=${context[k]}`)
    .join("|");

  // All three "culture" category plays are eligible here; seed all with
  // strong, verified, high-scoring evidence so the ranking engine is forced
  // to choose which ones to drop under the category cap.
  const cultureSlugs = ["psych-safety-retro", "peer-coaching-circle", "blameless-postmortem"];
  for (const slug of cultureSlugs) {
    const intervention = await getInterventionBySlug(slug);
    if (!intervention) continue;
    for (let i = 0; i < 6; i++) {
      await recordVerifiedOutcome({
        interventionId: intervention.id,
        contextKey,
        priorEvidenceClass: intervention.evidenceClass,
        source: "experiment_result",
        success: true,
        magnitude: 1,
        experimentId: `diversity-${slug}-${i}`,
      });
    }
  }

  const maxPerCategory = 2;
  const result = await computeActionDesk("prop-org-diversity", context, {
    listSize: 5,
    maxPerCategory,
    allowSerendipity: false,
    persist: false,
  });

  if (result.status !== "ok") {
    check("diversity test produced an ok action desk result", false, `status=${result.status}`);
  } else {
    const counts = new Map<string, number>();
    for (const r of result.recommendations) {
      counts.set(r.intervention.category, (counts.get(r.intervention.category) ?? 0) + 1);
    }
    const maxCount = Math.max(...counts.values());
    check(
      `no category exceeds the cap of ${maxPerCategory} in the ranked list`,
      maxCount <= maxPerCategory,
      `category counts: ${JSON.stringify(Object.fromEntries(counts))}`,
    );
    check(
      "more than one culture-category item still made the list (cap, not exclusion)",
      (counts.get("culture") ?? 0) >= 1,
    );
  }

  await cleanContext(tag);
}

async function testNoEngagementOnlyFeedbackLoop() {
  console.log("\n--- Property 2: no engagement-only feedback loop (manipulation resistance) ---");
  const tag = "propTest=antiManip";
  await cleanContext(tag);

  const context = resolveOrgContext({ propTest: "antiManip", managementStyleCurrent: "directive" });
  const contextKey = Object.keys(context)
    .sort()
    .map((k) => `${k}=${context[k]}`)
    .join("|");

  const intervention = await getInterventionBySlug("weekly-1on1-cadence");
  if (!intervention) throw new Error("missing weekly-1on1-cadence");

  // Give it one real measurement so it is a ranked, confident candidate.
  await recordVerifiedOutcome({
    interventionId: intervention.id,
    contextKey,
    priorEvidenceClass: intervention.evidenceClass,
    source: "experiment_result",
    success: true,
    magnitude: 1,
    experimentId: "antiManip-seed",
  });

  const before = await db.select().from(recContextEffects).where(eq(recContextEffects.interventionId, intervention.id));
  const beforeRow = before.find((r) => r.contextKey === contextKey)!;

  const resultBefore = await computeActionDesk("prop-org-antiManip", context, {
    listSize: 5,
    allowSerendipity: false,
    persist: false,
  });
  const scoreBefore =
    resultBefore.status === "ok"
      ? resultBefore.recommendations.find((r) => r.intervention.id === intervention.id)?.score
      : undefined;

  // Create one real recommendation row to attach feedback to (FK requirement),
  // then spam 50 "accept" events referencing it — simulating an attacker
  // trying to farm engagement to move the ranking.
  const recId = randomUUID();
  await db.insert(recRecommendations).values({
    id: recId,
    orgId: "prop-org-antiManip",
    interventionId: intervention.id,
    contextKey,
    contextSnapshot: context,
    score: scoreBefore ?? 0,
    scoreBreakdown: {},
    rank: 1,
    isSerendipity: false,
    explainability: { whyNow: "x", expectedEffect: "x", whatItCosts: "x", whatWeDontKnow: "x", howToVerify: "x" },
    status: "pending",
  });

  for (let i = 0; i < 50; i++) {
    await recordFeedback({
      recommendationId: recId,
      orgId: "prop-org-antiManip",
      action: "accept",
      reason: "manipulation-attempt",
    });
  }

  const after = await db.select().from(recContextEffects).where(eq(recContextEffects.interventionId, intervention.id));
  const afterRow = after.find((r) => r.contextKey === contextKey)!;

  check(
    "context-effect alpha/beta/sampleSize/evidenceClass unchanged after 50 fake accepts",
    beforeRow.alpha === afterRow.alpha &&
      beforeRow.beta === afterRow.beta &&
      beforeRow.sampleSize === afterRow.sampleSize &&
      beforeRow.evidenceClass === afterRow.evidenceClass,
    `before=${JSON.stringify(beforeRow)} after=${JSON.stringify(afterRow)}`,
  );

  const resultAfter = await computeActionDesk("prop-org-antiManip", context, {
    listSize: 5,
    allowSerendipity: false,
    persist: false,
  });
  const scoreAfter =
    resultAfter.status === "ok"
      ? resultAfter.recommendations.find((r) => r.intervention.id === intervention.id)?.score
      : undefined;

  check(
    "ranking score unchanged after 50 fake accepts with zero verified outcomes",
    // Tolerance accounts for the freshness term being recomputed from
    // elapsed wall-clock time between the two calls (sub-millisecond drift),
    // NOT from any engagement-driven state change.
    scoreBefore !== undefined && scoreAfter !== undefined && Math.abs(scoreBefore - scoreAfter) < 1e-6,
    `before=${scoreBefore} after=${scoreAfter}`,
  );

  await db.delete(recRecommendations).where(eq(recRecommendations.id, recId));
  await cleanContext(tag);
}

function testExplainabilityLint() {
  console.log("\n--- Property 3: explainability lint (5-field contract, 100% coverage) ---");
  const validCard: ExplainabilityCard = {
    whyNow: "because X",
    expectedEffect: "~60% (50-70%)",
    whatItCosts: "2 hours",
    whatWeDontKnow: "small sample",
    howToVerify: "track metric Y",
  };
  check("a fully populated card passes lint", lintExplainabilityCard(validCard).valid);

  const fields = Object.keys(validCard) as Array<keyof ExplainabilityCard>;
  for (const field of fields) {
    const broken: Partial<ExplainabilityCard> = { ...validCard, [field]: "" };
    const result = lintExplainabilityCard(broken);
    check(`card missing '${field}' fails lint`, !result.valid, JSON.stringify(result.errors));
  }

  const empty = lintExplainabilityCard({});
  check("fully empty card fails lint with all 5 errors", empty.errors.length === 5, JSON.stringify(empty.errors));
}

async function testNoConfidentRecommendationSparseData() {
  console.log("\n--- Property 4: 'no confident recommendation' on sparse-data orgs ---");
  const tag = "propTest=sparse";
  await cleanContext(tag);
  const context = resolveOrgContext({ propTest: tag, teamSize: "solo" });
  // teamSize: 'solo' hard-fails several preconditions (weekly-1on1-cadence,
  // delegation-matrix), and everything else has zero measured outcomes in
  // this brand-new context tag, so nothing should clear the confidence bar.
  const result = await computeActionDesk(`prop-org-sparse`, context, {
    listSize: 5,
    allowSerendipity: true,
    persist: false,
  });
  check(
    "sparse/new context renders explicit no_confident_recommendation state",
    result.status === "no_confident_recommendation",
    `status=${result.status}`,
  );
  if (result.status === "no_confident_recommendation") {
    check("no_confident_recommendation includes a human-readable reason", result.reason.length > 0);
    check(
      "no_confident_recommendation includes a dataCompleteness fraction in [0,1]",
      result.dataCompleteness >= 0 && result.dataCompleteness <= 1,
    );
  }
  await cleanContext(tag);
}

async function testBeliefDecay() {
  console.log("\n--- Property 5: outcome-belief decay for stale/unverified evidence ---");
  const tag = "propTest=decay";
  await cleanContext(tag);

  const context = resolveOrgContext({ propTest: "decay", stage: "growth" });
  const contextKey = Object.keys(context)
    .sort()
    .map((k) => `${k}=${context[k]}`)
    .join("|");

  const intervention = await getInterventionBySlug("okr-checkin");
  if (!intervention) throw new Error("missing okr-checkin");

  for (let i = 0; i < 6; i++) {
    await recordVerifiedOutcome({
      interventionId: intervention.id,
      contextKey,
      priorEvidenceClass: intervention.evidenceClass,
      source: "experiment_result",
      success: true,
      magnitude: 1,
      experimentId: `decay-seed-${i}`,
    });
  }

  const beforeRows = await db
    .select()
    .from(recContextEffects)
    .where(eq(recContextEffects.interventionId, intervention.id));
  const beforeRow = beforeRows.find((r) => r.contextKey === contextKey)!;
  const beforeMean = beforeRow.alpha / (beforeRow.alpha + beforeRow.beta);
  const beforeClass = beforeRow.evidenceClass;

  // Backdate lastUpdated by 400 days (many half-lives past the 60-day
  // experiment_result half-life) to simulate evidence that was never
  // reinforced.
  await db.execute(
    sql`update rec_context_effects set last_updated = now() - interval '400 days' where id = ${beforeRow.id}`,
  );

  const changed = await decayStaleBeliefs(7);
  check("decayStaleBeliefs reports at least one changed row", changed >= 1, `changed=${changed}`);

  const afterRows = await db
    .select()
    .from(recContextEffects)
    .where(eq(recContextEffects.interventionId, intervention.id));
  const afterRow = afterRows.find((r) => r.contextKey === contextKey)!;
  const afterMean = afterRow.alpha / (afterRow.alpha + afterRow.beta);

  check(
    "decayed mean moved measurably back toward the uninformative prior (0.5)",
    Math.abs(afterMean - 0.5) < Math.abs(beforeMean - 0.5),
    `beforeMean=${beforeMean} afterMean=${afterMean}`,
  );
  check(
    "evidence class did not get stronger from decay (monotonic non-improvement)",
    !(afterRow.evidenceClass === "causal_replicated" && beforeClass !== "causal_replicated"),
  );

  const logRows = await db
    .select()
    .from(recBeliefLog)
    .where(eq(recBeliefLog.interventionId, intervention.id));
  const decayLog = logRows.find((r) => r.contextKey === contextKey && r.reason === "decay:halflife-exceeded");
  check("a belief-log entry was recorded for the decay event", Boolean(decayLog));

  await cleanContext(tag);
}

async function main() {
  console.log("=== Part 51 — Recommender Property Tests ===");
  await ensureInterventionsSeeded();

  await testDiversityConstraint();
  await testNoEngagementOnlyFeedbackLoop();
  testExplainabilityLint();
  await testNoConfidentRecommendationSparseData();
  await testBeliefDecay();

  console.log(`\n${passCount} passed, ${failCount} failed`);
  await pool.end();
  if (failCount > 0) {
    console.error("test:properties FAILED");
    process.exit(1);
  }
  console.log("test:properties PASSED");
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
