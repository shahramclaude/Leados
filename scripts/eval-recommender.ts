/**
 * Part 51 — offline recommender evaluation harness (Phase 3e / Gate 1).
 *
 * Seeds a handful of synthetic orgs/contexts with a known-effective
 * intervention (strong, verified evidence) plus distractor interventions
 * with weak/no evidence, then checks:
 *
 *   - recall@5: does the known-best intervention appear in the top-5 Action
 *     Desk output for its scenario? Aggregate across scenarios, gate >= 0.7.
 *   - diversity: average fraction of unique categories in each top-5 list,
 *     gate >= 0.6 (declared threshold — documented below).
 *   - serendipity: a dedicated scenario asserts the serendipity slot is
 *     honored when allowed, and absent when disabled.
 *
 * Run with `npm run eval:recommender`. Exits non-zero on gate failure.
 */

import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { computeActionDesk } from "@/lib/recommender/ranking";
import { recordVerifiedOutcome } from "@/lib/recommender/beliefUpdate";
import { ensureInterventionsSeeded, getInterventionBySlug } from "@/lib/recommender/registry";
import { resolveOrgContext } from "@/lib/router/context";
import type { Context } from "@/lib/recommender/types";

const DIVERSITY_THRESHOLD = 0.6;
const RECALL_THRESHOLD = 0.7;

async function cleanEvalData() {
  await db.execute(sql`delete from rec_belief_log where context_key like '%evalScenario=%'`);
  await db.execute(sql`delete from rec_outcomes where context_key like '%evalScenario=%'`);
  await db.execute(sql`delete from rec_recommendations where context_key like '%evalScenario=%'`);
  await db.execute(sql`delete from rec_context_effects where context_key like '%evalScenario=%'`);
}

interface Scenario {
  id: string;
  context: Context;
  knownBestSlug: string;
  distractorSlugs: string[];
}

const SCENARIOS: Scenario[] = [
  {
    id: "s1-directive-team",
    context: {
      evalScenario: "s1",
      managementStyleCurrent: "directive",
      teamSize: "medium",
      stage: "growth",
    },
    knownBestSlug: "weekly-1on1-cadence",
    distractorSlugs: ["okr-checkin", "decision-log"],
  },
  {
    id: "s2-remote-team",
    context: {
      evalScenario: "s2",
      workMode: "remote",
      teamSize: "small",
      stage: "scale",
    },
    knownBestSlug: "async-standup",
    distractorSlugs: ["okr-checkin", "decision-log", "blameless-postmortem"],
  },
  {
    id: "s3-incident-heavy",
    context: {
      evalScenario: "s3",
      incidentRateRecent: "high",
      teamSize: "medium",
    },
    knownBestSlug: "blameless-postmortem",
    distractorSlugs: ["psych-safety-retro", "decision-log"],
  },
  {
    id: "s4-growth-planning",
    context: {
      evalScenario: "s4",
      stage: "growth",
      teamSize: "medium",
    },
    knownBestSlug: "okr-checkin",
    distractorSlugs: ["decision-log", "weekly-1on1-cadence"],
  },
  {
    id: "s5-multi-manager",
    context: {
      evalScenario: "s5",
      managerCount: "multiple",
      teamSize: "large",
    },
    knownBestSlug: "peer-coaching-circle",
    distractorSlugs: ["delegation-matrix", "decision-log", "okr-checkin"],
  },
];

async function seedScenario(scenario: Scenario) {
  const context = resolveOrgContext(scenario.context);
  const best = await getInterventionBySlug(scenario.knownBestSlug);
  if (!best) throw new Error(`unknown intervention slug ${scenario.knownBestSlug}`);

  const contextKeyParts = Object.keys(context)
    .sort()
    .map((k) => `${k}=${context[k]}`)
    .join("|");

  // Strong, verified evidence for the known-best intervention: 8 successful
  // experiment results => should become experimental/causal_replicated with
  // high mean effect.
  for (let i = 0; i < 8; i++) {
    await recordVerifiedOutcome({
      interventionId: best.id,
      contextKey: contextKeyParts,
      priorEvidenceClass: best.evidenceClass,
      source: "experiment_result",
      success: true,
      magnitude: 1,
      experimentId: `${scenario.id}-exp-${i}`,
    });
  }

  // Weak-but-real evidence for distractors, deterministic so the eval is not
  // flaky: positive but much smaller magnitude than the known-best, so they
  // remain eligible (non-zero sample size, positive utility) but rank below
  // the known-best intervention.
  for (const slug of scenario.distractorSlugs) {
    const distractor = await getInterventionBySlug(slug);
    if (!distractor) continue;
    await recordVerifiedOutcome({
      interventionId: distractor.id,
      contextKey: contextKeyParts,
      priorEvidenceClass: distractor.evidenceClass,
      source: "commitment_followthrough",
      success: true,
      magnitude: 0.3,
      commitmentId: `${scenario.id}-${slug}-commit`,
    });
  }

  return context;
}

async function runRecallAndDiversity() {
  const results: Array<{ scenario: string; hit: boolean; diversity: number; topCategories: string[] }> = [];

  for (const scenario of SCENARIOS) {
    const context = await seedScenario(scenario);
    const result = await computeActionDesk(`eval-org-${scenario.id}`, context, {
      listSize: 5,
      allowSerendipity: false,
      persist: false,
    });

    if (result.status !== "ok") {
      results.push({ scenario: scenario.id, hit: false, diversity: 0, topCategories: [] });
      continue;
    }

    const top5 = result.recommendations.slice(0, 5);
    const hit = top5.some((r) => r.intervention.slug === scenario.knownBestSlug);
    const categories = top5.map((r) => r.intervention.category);
    const uniqueCategories = new Set(categories).size;
    const diversity = top5.length > 0 ? uniqueCategories / top5.length : 0;

    results.push({ scenario: scenario.id, hit, diversity, topCategories: categories });
  }

  return results;
}

async function runSerendipityCheck() {
  // A scenario where the serendipity-eligible intervention is deliberately
  // out of profile (fit should land below the ceiling) but has strong
  // evidence seeded from ANOTHER context — the scoring in this scenario's
  // context must not get a high contextFit boost.
  const serendipityContext = resolveOrgContext({
    evalScenario: "serendipity",
    managerTenure: "new",
    teamSize: "small",
    managerCount: "single", // violates manager-shadowing precondition on purpose? check below
  });

  // manager-shadowing requires managerCount != 'single' as precondition, so
  // pick a candidate whose precondition is NOT violated but whose
  // applicableContexts don't match this context at all: peer-coaching-circle
  // requires managerCount != 'single' too. Use skip-level-listening instead,
  // whose precondition requires orgLayers in ["3+"] — give it a context
  // where orgLayers is NOT "3+" so applicableContexts fit is low but no hard
  // precondition fails... Actually skip-level-listening's precondition IS
  // orgLayers in ["3+"], which would hard-fail if orgLayers != "3+". Instead
  // use blameless-postmortem (no preconditions) with strong unrelated
  // evidence, in a context where incidentRateRecent is "normal" (its
  // applicableContexts want "elevated"/"high"), so fit is low but not zero.
  const context: Context = { ...serendipityContext, incidentRateRecent: "normal" };

  const contextKeyParts = Object.keys(context)
    .sort()
    .map((k) => `${k}=${context[k]}`)
    .join("|");

  const postmortem = await getInterventionBySlug("blameless-postmortem");
  if (!postmortem) throw new Error("missing blameless-postmortem");

  for (let i = 0; i < 6; i++) {
    await recordVerifiedOutcome({
      interventionId: postmortem.id,
      contextKey: contextKeyParts,
      priorEvidenceClass: postmortem.evidenceClass,
      source: "experiment_result",
      success: true,
      magnitude: 1,
      experimentId: `serendipity-exp-${i}`,
    });
  }

  const withSerendipity = await computeActionDesk("eval-org-serendipity", context, {
    listSize: 5,
    allowSerendipity: true,
    persist: false,
  });
  const withoutSerendipity = await computeActionDesk("eval-org-serendipity-off", context, {
    listSize: 5,
    allowSerendipity: false,
    persist: false,
  });

  const honoredWhenOn =
    withSerendipity.status === "ok" && withSerendipity.recommendations.some((r) => r.isSerendipity);
  const absentWhenOff =
    withoutSerendipity.status !== "ok" || !withoutSerendipity.recommendations.some((r) => r.isSerendipity);

  return { honoredWhenOn, absentWhenOff };
}

async function main() {
  console.log("=== Part 51 — Recommender Offline Evaluation ===\n");
  await ensureInterventionsSeeded();
  await cleanEvalData();

  const results = await runRecallAndDiversity();
  const recallAt5 = results.filter((r) => r.hit).length / results.length;
  const avgDiversity = results.reduce((sum, r) => sum + r.diversity, 0) / results.length;

  console.log("Scenario results:");
  for (const r of results) {
    console.log(
      `  ${r.scenario.padEnd(22)} hit=${String(r.hit).padEnd(5)} diversity=${r.diversity.toFixed(2)} categories=[${r.topCategories.join(
        ",",
      )}]`,
    );
  }
  console.log(`\nrecall@5     = ${recallAt5.toFixed(3)} (gate >= ${RECALL_THRESHOLD})`);
  console.log(`diversity    = ${avgDiversity.toFixed(3)} (gate >= ${DIVERSITY_THRESHOLD}, metric: unique categories / list length, averaged across scenarios)`);

  const serendipity = await runSerendipityCheck();
  console.log(
    `serendipity  = honoredWhenOn=${serendipity.honoredWhenOn} absentWhenOff=${serendipity.absentWhenOff} (gate: both true)`,
  );

  await cleanEvalData();

  const gates = [
    { name: "recall@5 >= 0.7", pass: recallAt5 >= RECALL_THRESHOLD },
    { name: "diversity >= 0.6", pass: avgDiversity >= DIVERSITY_THRESHOLD },
    { name: "serendipity slot honored when allowed", pass: serendipity.honoredWhenOn },
    { name: "serendipity slot absent when disallowed", pass: serendipity.absentWhenOff },
  ];

  console.log("\nGate summary:");
  let allPass = true;
  for (const g of gates) {
    console.log(`  [${g.pass ? "PASS" : "FAIL"}] ${g.name}`);
    if (!g.pass) allPass = false;
  }

  await pool.end();

  if (!allPass) {
    console.error("\neval:recommender FAILED");
    process.exit(1);
  }
  console.log("\neval:recommender PASSED");
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
