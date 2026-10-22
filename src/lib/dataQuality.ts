// LEADOS — Part 38 / Part 34 compatibility shim: data quality scores.
//
// Part 34 (not present in this sandbox) is expected to score ingested data
// on dimensions like completeness and validity. This module seeds a
// plausible daily history and supports injected decay for the harness.

import { ensureBaseline, recordObservation, seededNoise } from "@/lib/metrics";

export const DATA_COMPLETENESS_KEY = "dataquality.completeness";
export const DATA_VALIDITY_KEY = "dataquality.validity";

export async function seedDataQualityHistory(days = 30, injectDecayFromDay: number | null = null) {
  await ensureBaseline(DATA_COMPLETENESS_KEY, "data", 0.97);
  await ensureBaseline(DATA_VALIDITY_KEY, "data", 0.95);

  const now = Date.now();
  for (let day = 0; day < days; day++) {
    const decayActive = injectDecayFromDay !== null && day >= injectDecayFromDay;
    const jitter = (seededNoise(day * 61) - 0.5) * 0.01;
    const decayPenalty = decayActive ? 0.015 * (day - (injectDecayFromDay ?? 0) + 1) : 0;
    const completeness = Math.max(0.5, 0.97 + jitter - decayPenalty);
    const validity = Math.max(0.5, 0.95 + jitter - decayPenalty * 0.9);
    const observedAt = new Date(now - (days - day) * 86400000);
    await recordObservation({
      metricKey: DATA_COMPLETENESS_KEY,
      domain: "data",
      value: completeness,
      windowLabel: `daily-${observedAt.toISOString().slice(0, 10)}`,
      observedAt,
    });
    await recordObservation({
      metricKey: DATA_VALIDITY_KEY,
      domain: "data",
      value: validity,
      windowLabel: `daily-${observedAt.toISOString().slice(0, 10)}`,
      observedAt,
    });
  }
}
