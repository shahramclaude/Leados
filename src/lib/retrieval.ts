// LEADOS — Part 38 / Part 12 compatibility shim: retrieval quality eval.
//
// Part 12's retrieval eval set (not present in this sandbox) is re-run
// weekly against a fixed labeled query set to produce precision/recall.
// This module seeds a plausible weekly history and supports injected decay
// (e.g. simulating index staleness or an embedding regression).

import { ensureBaseline, recordObservation, seededNoise } from "@/lib/metrics";

export const RETRIEVAL_PRECISION_KEY = "retrieval.precision_at_5";
export const RETRIEVAL_RECALL_KEY = "retrieval.recall_at_10";

export async function seedRetrievalHistory(weeks = 12, injectDecayFromWeek: number | null = null) {
  await ensureBaseline(RETRIEVAL_PRECISION_KEY, "retrieval", 0.82);
  await ensureBaseline(RETRIEVAL_RECALL_KEY, "retrieval", 0.76);

  const now = Date.now();
  for (let w = 0; w < weeks; w++) {
    const decayActive = injectDecayFromWeek !== null && w >= injectDecayFromWeek;
    const jitter = (seededNoise(w * 17) - 0.5) * 0.03;
    const decayPenalty = decayActive ? 0.01 * (w - (injectDecayFromWeek ?? 0) + 1) : 0;
    const precision = Math.max(0.3, 0.82 + jitter - decayPenalty);
    const recall = Math.max(0.3, 0.76 + jitter - decayPenalty * 0.8);
    const observedAt = new Date(now - (weeks - w) * 7 * 86400000);
    await recordObservation({
      metricKey: RETRIEVAL_PRECISION_KEY,
      domain: "retrieval",
      value: precision,
      windowLabel: `weekly-${observedAt.toISOString().slice(0, 10)}`,
      observedAt,
    });
    await recordObservation({
      metricKey: RETRIEVAL_RECALL_KEY,
      domain: "retrieval",
      value: recall,
      windowLabel: `weekly-${observedAt.toISOString().slice(0, 10)}`,
      observedAt,
    });
  }
}
