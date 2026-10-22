// LEADOS — Part 38: the assurance check runner.
//
// Orchestrates one execution of one check for one cycle: idempotent
// (unique assurance_runs[checkId, cycleKey]), writes drift_series rows,
// and dispatches to the correct remediation tier on breach. Designed to sit
// on Part 10's scheduler via claimCycle()/completeCycle() in
// scripts/runAssuranceCycle.ts.

import { db } from "@/db";
import { assuranceRuns, driftSeries } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { CHECK_REGISTRY, type Check } from "@/lib/assurance/registry";
import { evaluateCheck, type CheckEvaluation } from "@/lib/evaluation";
import { getRecentSeries } from "@/lib/metrics";
import { detectDrift, stddev } from "@/lib/drift";
import { applyAlert, applyDegrade, applyEscalate, applySafeAutoFix } from "@/lib/assurance/remediation";
import { rerunFailedCheck } from "@/lib/selfImprove";

export interface RunOutcome {
  checkId: string;
  cycleKey: string;
  status: string;
  skippedIdempotent: boolean;
  remediation?: { tier: string; status: string; detail: string };
}

async function persistDriftSeries(check: Check, evaluation: CheckEvaluation) {
  for (const metric of evaluation.metrics) {
    if (metric.latestValue === null || metric.baseline === null) continue;
    const series = await getRecentSeries(metric.metricKey, 30);
    const values = series.map((s) => s.value);
    const drift = detectDrift(values, metric.baseline);
    const sigma = stddev(values);
    await db.insert(driftSeries).values({
      checkId: check.id,
      metricKey: metric.metricKey,
      domain: check.domain,
      value: metric.latestValue,
      baseline: metric.baseline,
      ewma: drift.latestEwma,
      ewmaUcl: metric.baseline + 3 * (sigma || Math.abs(metric.baseline) * 0.05),
      ewmaLcl: metric.baseline - 3 * (sigma || Math.abs(metric.baseline) * 0.05),
      cusumPos: drift.latestCusumPos,
      cusumNeg: drift.latestCusumNeg,
      cusumThreshold: drift.cusum.h,
      flagged: drift.flagged,
      method: "both",
    });
  }
}

export async function runCheckForCycle(check: Check, cycleKey: string): Promise<RunOutcome> {
  const existing = await db
    .select()
    .from(assuranceRuns)
    .where(and(eq(assuranceRuns.checkId, check.id), eq(assuranceRuns.cycleKey, cycleKey)))
    .limit(1);

  if (existing.length > 0) {
    return { checkId: check.id, cycleKey, status: existing[0].status, skippedIdempotent: true };
  }

  let evaluation: CheckEvaluation;
  try {
    evaluation = await evaluateCheck(check);
  } catch (err) {
    await db.insert(assuranceRuns).values({
      checkId: check.id,
      cycleKey,
      status: "error",
      details: { error: err instanceof Error ? err.message : String(err) },
    });
    return { checkId: check.id, cycleKey, status: "error", skippedIdempotent: false };
  }

  const worstMetric = evaluation.metrics.find((m) => m.status === evaluation.status) ?? evaluation.metrics[0] ?? null;

  const [run] = await db
    .insert(assuranceRuns)
    .values({
      checkId: check.id,
      cycleKey,
      status: evaluation.status,
      metricValue: worstMetric?.latestValue ?? null,
      baselineValue: worstMetric?.baseline ?? null,
      details: { summary: evaluation.summary, metrics: evaluation.metrics },
    })
    .returning();

  await persistDriftSeries(check, evaluation);

  let remediation: RunOutcome["remediation"];
  if (evaluation.status === "breach") {
    if (check.onBreach === "auto_fix") {
      const outcome = await applySafeAutoFix(check, run.id, async () => {
        await rerunFailedCheck(check);
      });
      remediation = { tier: outcome.tier, status: outcome.status, detail: outcome.detail };
    } else if (check.onBreach === "degrade") {
      const outcome = await applyDegrade(check, run.id);
      remediation = { tier: outcome.tier, status: outcome.status, detail: outcome.detail };
    } else if (check.onBreach === "finding") {
      const outcome = await applyEscalate(check, run.id, evaluation.summary);
      remediation = { tier: outcome.tier, status: outcome.status, detail: outcome.detail };
    } else {
      const outcome = await applyAlert(check, run.id, evaluation.summary);
      remediation = { tier: outcome.tier, status: outcome.status, detail: outcome.detail };
    }
  }

  return { checkId: check.id, cycleKey, status: evaluation.status, skippedIdempotent: false, remediation };
}

export async function runAllChecks(cycleKey: string, budget: number): Promise<RunOutcome[]> {
  const outcomes: RunOutcome[] = [];
  const enabledChecks = CHECK_REGISTRY.slice(0, budget);
  for (const check of enabledChecks) {
    outcomes.push(await runCheckForCycle(check, cycleKey));
  }
  return outcomes;
}
