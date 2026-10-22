// LEADOS — Part 38 / Part 09 compatibility shim: fairness metrics.
//
// Part 09's fairness suite (not present in this sandbox) is expected to
// compute group-fairness metrics such as Demographic Parity Difference (DPD)
// and Equal Opportunity Difference (EOD) across protected groups. This
// module provides the math plus a seeding routine producing a rolling
// history so `fairness-parity-decay` has real numbers, and supports
// injecting decay for the drift-injection harness.

import { ensureBaseline, recordObservation, seededNoise } from "@/lib/metrics";

export interface GroupOutcome {
  group: string;
  predictedPositive: boolean;
  actualPositive: boolean;
}

export function demographicParityDifference(samples: GroupOutcome[]): number {
  const groups = Array.from(new Set(samples.map((s) => s.group)));
  const rates = groups.map((g) => {
    const groupSamples = samples.filter((s) => s.group === g);
    return groupSamples.filter((s) => s.predictedPositive).length / Math.max(1, groupSamples.length);
  });
  return Math.max(...rates) - Math.min(...rates);
}

export function equalOpportunityDifference(samples: GroupOutcome[]): number {
  const groups = Array.from(new Set(samples.map((s) => s.group)));
  const tprs = groups.map((g) => {
    const positives = samples.filter((s) => s.group === g && s.actualPositive);
    if (positives.length === 0) return 0;
    return positives.filter((s) => s.predictedPositive).length / positives.length;
  });
  return Math.max(...tprs) - Math.min(...tprs);
}

export const FAIRNESS_DPD_KEY = "fairness.demographic_parity_diff";
export const FAIRNESS_EOD_KEY = "fairness.equal_opportunity_diff";

export async function seedFairnessHistory(days = 30, injectDecayFromDay: number | null = null) {
  await ensureBaseline(FAIRNESS_DPD_KEY, "fairness", 0.05);
  await ensureBaseline(FAIRNESS_EOD_KEY, "fairness", 0.04);

  const now = Date.now();
  for (let day = 0; day < days; day++) {
    const decayActive = injectDecayFromDay !== null && day >= injectDecayFromDay;
    const samples: GroupOutcome[] = Array.from({ length: 300 }, (_, i) => {
      const noise = seededNoise(day * 500 + i);
      const group = noise < 0.5 ? "group_a" : "group_b";
      const biasShift = decayActive && group === "group_b" ? 0.18 : 0;
      const basePositiveRate = 0.45 + biasShift;
      const predictedPositive = seededNoise(day * 900 + i * 3) < basePositiveRate;
      const actualPositive = seededNoise(day * 1300 + i * 5) < 0.45;
      return { group, predictedPositive, actualPositive };
    });
    const dpd = demographicParityDifference(samples);
    const eod = equalOpportunityDifference(samples);
    const observedAt = new Date(now - (days - day) * 86400000);
    await recordObservation({
      metricKey: FAIRNESS_DPD_KEY,
      domain: "fairness",
      value: dpd,
      windowLabel: `daily-${observedAt.toISOString().slice(0, 10)}`,
      observedAt,
    });
    await recordObservation({
      metricKey: FAIRNESS_EOD_KEY,
      domain: "fairness",
      value: eod,
      windowLabel: `daily-${observedAt.toISOString().slice(0, 10)}`,
      observedAt,
    });
  }
}
