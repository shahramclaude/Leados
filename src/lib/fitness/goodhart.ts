// LEADOS — Part 39: Goodhart Watch — anomaly detection on suspicious joint
// movement of a metric and its declared counter-metric (Part 13's anomaly
// detection pattern, applied here to metric-pair divergence).
//
// Logic: compute the percentage change of a metric in its "good" direction
// (i.e., positive = genuine improvement) and the percentage change of its
// counter-metric, also oriented so positive = genuine improvement for THAT
// metric. If the primary metric improved a lot while its counter-metric
// *worsened* beyond a threshold in the same window, that is the Goodhart
// signature: the number moved without (or against) real progress.

import { getMetric } from "./dimensions";
import type { FitnessMetric } from "./types";

export interface GoodhartSample {
  metricId: string;
  periodValue: number;
  previousValue: number;
}

export type GoodhartSeverity = "info" | "watch" | "high";

export interface GoodhartFinding {
  metricId: string;
  metricName: string;
  counterMetricId: string;
  counterMetricName: string;
  metricDeltaPct: number; // oriented so positive = improvement
  counterDeltaPct: number; // oriented so positive = improvement
  severity: GoodhartSeverity;
  suspicious: boolean;
  note: string;
}

/** Oriented % change: positive always means "moved in the direction that looks like improvement". */
function orientedPctChange(metric: FitnessMetric, previous: number, current: number): number {
  if (previous === 0) return current === 0 ? 0 : (current > 0 ? 1 : -1) * 100;
  const raw = ((current - previous) / Math.abs(previous)) * 100;
  return metric.direction === "higher_better" ? raw : -raw;
}

const IMPROVEMENT_THRESHOLD_PCT = 8; // metric must show a meaningful "improvement" to be worth checking
const COUNTER_WORSENING_THRESHOLD_PCT = -8; // counter-metric must worsen meaningfully to flag

export function analyzeGoodhartPair(
  metric: FitnessMetric,
  previousValue: number,
  currentValue: number,
  counterPreviousValue: number,
  counterCurrentValue: number,
): GoodhartFinding {
  const counter = getMetric(metric.counterMetricId);
  const metricDeltaPct = orientedPctChange(metric, previousValue, currentValue);
  const counterDeltaPct = orientedPctChange(counter, counterPreviousValue, counterCurrentValue);

  const metricImproved = metricDeltaPct >= IMPROVEMENT_THRESHOLD_PCT;
  const counterWorsened = counterDeltaPct <= COUNTER_WORSENING_THRESHOLD_PCT;

  let severity: GoodhartSeverity = "info";
  let suspicious = false;
  let note = `${metric.name} moved ${metricDeltaPct.toFixed(1)}% (improvement-oriented) while ${counter.name} moved ${counterDeltaPct.toFixed(1)}%. No suspicious divergence detected.`;

  if (metricImproved && counterWorsened) {
    suspicious = true;
    const magnitude = metricDeltaPct - counterDeltaPct;
    severity = magnitude > 30 ? "high" : "watch";
    note = `${metric.name} improved ${metricDeltaPct.toFixed(1)}% while its paired counter-metric ${counter.name} worsened ${Math.abs(counterDeltaPct).toFixed(1)}% in the same window. ${metric.counterRationale} This pattern matches the authored Goodhart risk: "${metric.goodhartRisk}"`;
  }

  return {
    metricId: metric.id,
    metricName: metric.name,
    counterMetricId: counter.id,
    counterMetricName: counter.name,
    metricDeltaPct,
    counterDeltaPct,
    severity,
    suspicious,
    note,
  };
}
