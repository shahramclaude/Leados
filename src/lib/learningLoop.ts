// LEADOS — Part 38 / Part 30 compatibility shim: learning-loop regression.
//
// Part 30's learning loop (not present in this sandbox) periodically
// retrains/updates models from feedback. This module seeds a weekly
// "regression score" series (1.0 = no regression vs. last known-good,
// lower = worse) representing the result of re-running a fixed regression
// suite after each learning-loop update.

import { ensureBaseline, recordObservation, seededNoise } from "@/lib/metrics";

export const LEARNING_LOOP_REGRESSION_KEY = "learningloop.eval_regression_score";

export async function seedLearningLoopHistory(weeks = 12, injectRegressionFromWeek: number | null = null) {
  await ensureBaseline(LEARNING_LOOP_REGRESSION_KEY, "intelligence", 0.98);
  const now = Date.now();
  for (let w = 0; w < weeks; w++) {
    const regressionActive = injectRegressionFromWeek !== null && w >= injectRegressionFromWeek;
    const jitter = (seededNoise(w * 71) - 0.5) * 0.015;
    const score = Math.max(0.4, 0.98 + jitter - (regressionActive ? 0.15 : 0));
    const observedAt = new Date(now - (weeks - w) * 7 * 86400000);
    await recordObservation({
      metricKey: LEARNING_LOOP_REGRESSION_KEY,
      domain: "intelligence",
      value: score,
      windowLabel: `weekly-${observedAt.toISOString().slice(0, 10)}`,
      observedAt,
    });
  }
}
