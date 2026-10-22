import { ewmaMomentum } from "@/lib/stats/drift";
import { explain, type Explain } from "@/lib/explain";

/**
 * Momentum = EWMA of adoption-proxy deltas (habit-stage rate over time).
 * A positive value means the habit-adoption rate is trending up; negative
 * means it is trending down. Computed on a group-aggregate time series only.
 */
export function momentumFromSeries(habitRateSeries: readonly number[], alpha = 0.3): Explain<number> {
  const value = ewmaMomentum(habitRateSeries, alpha);
  const trend = value > 0.005 ? "up" : value < -0.005 ? "down" : "flat";
  return explain(Number(value.toFixed(4)), "ewma_momentum_v1", {
    alpha,
    points: habitRateSeries.length,
    trend,
  }, {
    confidence: habitRateSeries.length >= 4 ? "medium" : "low",
    caveats: [
      "Momentum reacts to the most recent period and can be noisy with few data points.",
      "A flat or negative momentum does not by itself indicate failure — compare against the funnel stage and change-load context.",
    ],
  });
}
