import { db } from "@/db";
import {
  evolutionLoops,
  fitnessMetricSamples,
  fitnessSnapshots,
  fitnessWeightPolicies,
  legacyHealthScores,
} from "@/db/schema";
import { computeFitness } from "@/lib/fitness/compute";
import { defaultWeightMap } from "@/lib/fitness/dimensions";
import { generateDemoPeriods } from "@/lib/fitness/demoData";
import { LEGACY_HEALTH_SCORES } from "@/lib/fitness/legacy";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Dev/demo seed endpoint: populates one active weight policy (v1, default
 * weights), 6 months of metric samples (with one deliberately-seeded gaming
 * period), a full fitness snapshot per period, the legacy health-score audit
 * catalog, and one fully-lifecycled evolution loop (hypothesis -> belief
 * update) with a twin prediction, human approval, and counterfactual.
 *
 * Idempotent-ish: clears prior demo rows before reseeding.
 */
export async function POST() {
  try {
    await db.execute(sql`truncate table ${fitnessSnapshots} restart identity cascade`);
    await db.execute(sql`truncate table ${fitnessMetricSamples} restart identity cascade`);
    await db.execute(sql`truncate table ${evolutionLoops} restart identity cascade`);
    await db.execute(sql`truncate table ${fitnessWeightPolicies} restart identity cascade`);
    await db.execute(sql`truncate table ${legacyHealthScores} restart identity cascade`);

    // 1. Legacy audit catalog.
    for (const legacy of LEGACY_HEALTH_SCORES) {
      await db.insert(legacyHealthScores).values(legacy);
    }

    // 2. Active weight policy v1.
    const [policy] = await db
      .insert(fitnessWeightPolicies)
      .values({
        version: 1,
        name: "Default Policy v1",
        rationale:
          "Seeded default policy balancing execution and financial resilience most heavily, with people sustainability and decision quality next, reflecting current board priorities for FY2025.",
        weights: defaultWeightMap(),
        status: "active",
        createdBy: "org-admin",
        activatedAt: new Date(),
      })
      .returning();

    // 3. Metric samples + fitness snapshot per period.
    const periods = generateDemoPeriods(6);
    let lastDimensionScores: Record<string, number> = {};
    for (const period of periods) {
      for (const [metricId, value] of Object.entries(period.values)) {
        await db.insert(fitnessMetricSamples).values({
          metricId,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          value: value.toString(),
          source: "manual",
        });
      }

      const weights = policy.weights as ReturnType<typeof defaultWeightMap>;
      const result = computeFitness({
        weights,
        metricValues: period.values,
        policyId: policy.id,
        policyVersion: policy.version,
      });
      lastDimensionScores = Object.fromEntries(result.dimensions.map((d) => [d.id, d.score]));

      await db.insert(fitnessSnapshots).values({
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        policyId: policy.id,
        fitness: result.fitness.toFixed(4),
        decomposition: result.dimensions,
        sensitivity: {
          weights: Object.fromEntries(result.dimensions.map((d) => [d.id, d.weightSensitivity])),
          metrics: Object.fromEntries(
            result.dimensions.flatMap((d) => d.metrics.map((m) => [m.id, m.sensitivity])),
          ),
        },
      });
    }

    // 4. One fully-lifecycled evolution loop for the demo (decision_quality).
    const approvedAt = new Date();
    await db.insert(evolutionLoops).values({
      title: "Introduce pre-mortem review before T2/T3 decisions ship",
      dimensionId: "decision_quality",
      hypothesis:
        "Fitness trend + drift detection flagged decision_outcome_realization_rate stalling relative to decision_adoption_rate over the last 3 periods (Goodhart risk: decisions adopted but not realized). Hypothesis: a mandatory pre-mortem step before T2/T3 decisions ship will raise realization without hurting adoption speed.",
      relatedExperimentId: "exp-2025-014-premortem",
      twinPredictedDelta: "0.035",
      twinConfidence: "0.62",
      stage: "belief_updated",
      decisionTier: "T3",
      decisionId: "dec-2025-0091",
      approvedBy: "VP Operations (J. Alvarez)",
      approvedAt,
      executionRef: "exec-run-7721",
      executedAt: approvedAt,
      measuredAt: new Date(),
      actualDelta: "0.028",
      counterfactualDelta: "0.006",
      counterfactualNote:
        "Pre-period linear-trend counterfactual (declared proxy — see caveat in /api/fitness/counterfactual) estimated fitness would have drifted +0.006 without the intervention; actual observed delta was +0.028, suggesting the intervention contributed roughly +0.022 beyond the pre-existing trend.",
      beliefUpdateNote:
        "Belief updated: pre-mortem reviews show a real, trend-beating effect on decision quality this quarter. Confidence raised from 0.62 (twin prediction) given the actual-vs-counterfactual gap; recommend extending to all T2 decisions next quarter, subject to a fresh human decision.",
    });

    return Response.json({
      ok: true,
      policyId: policy.id,
      periodsSeeded: periods.length,
      lastDimensionScores,
    });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "seed failed" }, { status: 500 });
  }
}
