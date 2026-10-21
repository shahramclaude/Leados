/**
 * forecastService.ts — pulls raw observations/predictions from Postgres,
 * fits the belief primitives, and returns Explain<T> envelopes. This is the
 * ONLY place that is allowed to turn "we queried the database" into "here is
 * a forecast" — UI and API routes must go through here, never compute a
 * belief ad hoc.
 */

import { db } from "@/db";
import { observations, predictions, findings } from "@/db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import { RateBelief, LevelBelief, DriftBelief } from "./beliefs";
import { explainRate, explainLevel, explainDrift } from "./explain";
import { Explain, EvidenceRef } from "./types";
import { calibrationReport } from "@/lib/stats";

const ECE_FINDING_THRESHOLD = 0.05;

export async function getCompletionRateForecast(metric = "task_completion_rate"): Promise<Explain<number>> {
  const rows = await db
    .select({ success: observations.success })
    .from(observations)
    .where(sql`${observations.metric} = ${metric} and ${observations.kind} = 'rate'`);

  const successes = rows.filter((r) => r.success === true).length;
  const failures = rows.filter((r) => r.success === false).length;
  const belief = RateBelief.prior(1, 1).update(successes, failures);

  const evidence: EvidenceRef[] = [
    { ref: `observations:${metric}`, weight: rows.length, direction: "neutral" },
  ];

  return explainRate(belief, {
    method: "Beta(1,1) prior updated with observed successes/failures (conjugate posterior).",
    modelCardId: "completion-rate-v1",
    evidence,
    nextDataNeeded: rows.length === 0 ? "At least a handful of resolved task outcomes logged to `observations`." : undefined,
  });
}

export async function getCycleTimeForecast(metric = "cycle_time_days"): Promise<Explain<number>> {
  const rows = await db
    .select({ value: observations.value })
    .from(observations)
    .where(sql`${observations.metric} = ${metric} and ${observations.kind} = 'level'`);

  const samples = rows.map((r) => r.value).filter((v): v is number => typeof v === "number");
  const belief = LevelBelief.prior(0, 1e-3, 1, 1).updateWithSamples(samples);

  const evidence: EvidenceRef[] = [
    { ref: `observations:${metric}`, weight: samples.length, direction: "neutral" },
  ];

  return explainLevel(belief, {
    method: "Normal-Inverse-Gamma conjugate posterior over observed cycle-time samples.",
    modelCardId: "cycle-time-v1",
    evidence,
    unit: "days",
    nextDataNeeded: samples.length === 0 ? "At least a handful of completed cycle-time measurements." : undefined,
  });
}

export async function getEngagementDriftForecast(metric = "weekly_engagement_score"): Promise<Explain<number>> {
  const rows = await db
    .select({ value: observations.value, createdAt: observations.createdAt })
    .from(observations)
    .where(sql`${observations.metric} = ${metric} and ${observations.kind} = 'drift'`)
    .orderBy(asc(observations.createdAt));

  const samples = rows.map((r) => r.value).filter((v): v is number => typeof v === "number");
  if (samples.length === 0) {
    return explainDrift(DriftBelief.init(0.3, 0, 1), {
      method: "EWMA(lambda=0.3) with 3-sigma control limits.",
      modelCardId: "engagement-drift-v1",
      nextDataNeeded: "At least a few weekly engagement readings.",
    });
  }

  let belief = DriftBelief.init(0.3, samples[0], Math.max(1e-6, Math.abs(samples[0]) * 0.1 || 1));
  for (const x of samples.slice(1)) belief = belief.update(x);

  const evidence: EvidenceRef[] = [
    { ref: `observations:${metric}`, weight: samples.length, direction: "neutral" },
  ];

  return explainDrift(belief, {
    method: "EWMA(lambda=0.3) with 3-sigma control limits over weekly engagement readings.",
    modelCardId: "engagement-drift-v1",
    evidence,
  });
}

export async function logPrediction(args: {
  modelCardId: string;
  metric: string;
  predictedP: number;
  context?: unknown;
}) {
  const [row] = await db
    .insert(predictions)
    .values({
      modelCardId: args.modelCardId,
      metric: args.metric,
      predictedP: args.predictedP,
      context: args.context as object | undefined,
    })
    .returning();
  return row;
}

export async function resolvePrediction(id: number, outcome: 0 | 1) {
  const [row] = await db
    .update(predictions)
    .set({ outcome, resolvedAt: new Date() })
    .where(eq(predictions.id, id))
    .returning();
  return row;
}

/**
 * Weekly (or on-demand) calibration self-check: compares recently resolved
 * predictions against outcomes; auto-opens a `findings` row when ECE exceeds
 * the 0.05 threshold. Idempotent-ish: skips opening a duplicate finding if
 * one is already open for the same metric window.
 */
export async function runCalibrationSelfCheck(windowDays = 90) {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ predictedP: predictions.predictedP, outcome: predictions.outcome })
    .from(predictions)
    .where(sql`${predictions.resolvedAt} is not null and ${predictions.createdAt} >= ${since}`);

  const samples = rows
    .filter((r): r is { predictedP: number; outcome: number } => r.outcome !== null)
    .map((r) => ({ p: r.predictedP, o: (r.outcome === 1 ? 1 : 0) as 0 | 1 }));

  if (samples.length < 10) {
    return { status: "insufficient-data" as const, n: samples.length, ece: null, openedFinding: false };
  }

  const report = calibrationReport(samples);
  let openedFinding = false;

  if (report.ece > ECE_FINDING_THRESHOLD) {
    const existingOpen = await db
      .select({ id: findings.id })
      .from(findings)
      .where(sql`${findings.type} = 'calibration-drift' and ${findings.status} = 'open'`)
      .limit(1);

    if (existingOpen.length === 0) {
      await db.insert(findings).values({
        type: "calibration-drift",
        severity: report.ece > 0.1 ? "critical" : "warning",
        message: `Weekly calibration self-check: ECE=${report.ece.toFixed(4)} exceeds the 0.05 threshold over ${samples.length} resolved predictions in the last ${windowDays} days.`,
        metricRef: "ece",
        value: report.ece,
        threshold: ECE_FINDING_THRESHOLD,
        status: "open",
      });
      openedFinding = true;
    }
  }

  return { status: "ok" as const, n: samples.length, ece: report.ece, brierScore: report.brierScore, openedFinding, report };
}

export async function listOpenFindings() {
  return db.select().from(findings).where(eq(findings.status, "open")).orderBy(desc(findings.createdAt));
}
