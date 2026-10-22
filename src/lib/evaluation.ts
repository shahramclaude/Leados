// LEADOS — Part 38: generic check-evaluation harness.
//
// Evaluates a single Check against the metric_observations history: pulls
// each declared metricKey's recent series, compares the latest value to its
// threshold, and runs EWMA+CUSUM drift detection against the stored
// baseline. The worst-case status across the check's metricKeys becomes the
// check's overall status for the cycle.

import { getBaseline, getRecentSeries } from "@/lib/metrics";
import { detectDrift } from "@/lib/drift";
import type { Check } from "@/lib/assurance/registry";

export type CheckStatus = "pass" | "warn" | "breach" | "error";

export interface MetricEvaluation {
  metricKey: string;
  latestValue: number | null;
  baseline: number | null;
  status: CheckStatus;
  driftFlagged: boolean;
  ewmaLatest: number | null;
  cusumPos: number | null;
  cusumNeg: number | null;
  seriesLength: number;
}

export interface CheckEvaluation {
  checkId: string;
  status: CheckStatus;
  metrics: MetricEvaluation[];
  summary: string;
}

const STATUS_RANK: Record<CheckStatus, number> = { pass: 0, warn: 1, breach: 2, error: 3 };

function worseStatus(a: CheckStatus, b: CheckStatus): CheckStatus {
  return STATUS_RANK[b] > STATUS_RANK[a] ? b : a;
}

function evaluateThreshold(value: number, baseline: number, check: Check, metricKey: string): CheckStatus {
  const { mode, warn, breach } = check.threshold;
  const direction = check.metricDirections?.[metricKey] ?? check.threshold.direction;

  if (mode === "absolute") {
    if (direction === "above") {
      if (value >= breach) return "breach";
      if (value >= warn) return "warn";
      return "pass";
    }
    if (value <= breach) return "breach";
    if (value <= warn) return "warn";
    return "pass";
  }

  // ratio mode: judge the metric relative to its OWN baseline so one
  // threshold object works across metrics with different natural scales.
  const magnitude = Math.abs(baseline) > 1e-9 ? Math.abs(baseline) : 1e-9;
  const relativeDeviation = direction === "above" ? (value - baseline) / magnitude : (baseline - value) / magnitude;

  if (relativeDeviation >= breach) return "breach";
  if (relativeDeviation >= warn) return "warn";
  return "pass";
}

export async function evaluateCheck(check: Check): Promise<CheckEvaluation> {
  const metrics: MetricEvaluation[] = [];
  let overall: CheckStatus = "pass";

  for (const metricKey of check.metricKeys) {
    const series = await getRecentSeries(metricKey, 30);
    const baseline = await getBaseline(metricKey);

    if (series.length === 0 || baseline === null) {
      metrics.push({
        metricKey,
        latestValue: null,
        baseline,
        status: "error",
        driftFlagged: false,
        ewmaLatest: null,
        cusumPos: null,
        cusumNeg: null,
        seriesLength: series.length,
      });
      overall = worseStatus(overall, "error");
      continue;
    }

    const values = series.map((s) => s.value);
    const latest = values[values.length - 1];
    const thresholdStatus = evaluateThreshold(latest, baseline, check, metricKey);
    const drift = detectDrift(values, baseline);
    const driftStatus: CheckStatus = drift.flagged ? "warn" : "pass";
    const status = worseStatus(thresholdStatus, driftStatus);

    metrics.push({
      metricKey,
      latestValue: latest,
      baseline,
      status,
      driftFlagged: drift.flagged,
      ewmaLatest: drift.latestEwma,
      cusumPos: drift.latestCusumPos,
      cusumNeg: drift.latestCusumNeg,
      seriesLength: series.length,
    });
    overall = worseStatus(overall, status);
  }

  const summary =
    overall === "pass"
      ? `All ${metrics.length} metric(s) within threshold and no statistical drift detected.`
      : `${metrics.filter((m) => m.status !== "pass").length} of ${metrics.length} metric(s) at ${overall} level.`;

  return { checkId: check.id, status: overall, metrics, summary };
}
