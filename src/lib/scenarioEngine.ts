import type { Domain, MetricDefinition, MonteCarloResult } from "@/lib/types";
import { mulberry32, makeGaussian, percentile, buildHistogram } from "@/lib/prng";

// ─────────────────────────────────────────────────────────────────────────
// scenarioEngine — baseline metric definitions + Monte Carlo surface used
// by strategicIntelligence.runScenarioSurveillance().
// DESIGN PARAMETER: deviation threshold for scenario activation = 2σ.
// DESIGN PARAMETER: Monte Carlo sample size n = 1000.
// ─────────────────────────────────────────────────────────────────────────

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  { key: "arr_growth_rate", label: "ARR Growth Rate", baseline: 0.08, stdev: 0.02, unit: "ratio/mo", domain: "finance" },
  { key: "net_burn", label: "Net Burn", baseline: 250000, stdev: 40000, unit: "$/mo", domain: "finance" },
  { key: "logo_churn_rate", label: "Logo Churn Rate", baseline: 0.02, stdev: 0.01, unit: "ratio/mo", domain: "sales" },
  { key: "nps", label: "Net Promoter Score", baseline: 42, stdev: 8, unit: "score", domain: "people" },
  { key: "pipeline_coverage", label: "Pipeline Coverage", baseline: 3.2, stdev: 0.6, unit: "x", domain: "sales" },
  { key: "deal_cycle_days", label: "Deal Cycle Length", baseline: 34, stdev: 6, unit: "days", domain: "sales" },
  { key: "support_ticket_volume", label: "Support Ticket Volume", baseline: 120, stdev: 25, unit: "tickets/wk", domain: "execution" },
  { key: "headcount_growth_rate", label: "Headcount Growth Rate", baseline: 0.03, stdev: 0.015, unit: "ratio/mo", domain: "people" },
];

export const DEVIATION_THRESHOLD_SIGMA = 2;
export const MONTE_CARLO_N = 1000;

export function deviationSigma(actual: number, def: MetricDefinition): number {
  if (def.stdev === 0) return 0;
  return (actual - def.baseline) / def.stdev;
}

/**
 * Monte Carlo simulation of a metric's near-term trajectory, modeled as a
 * random walk around the current actual value with volatility = metric
 * stdev (i.e. a discrete analogue of geometric Brownian motion for
 * dimensionless/ratio metrics). Returns percentile bands + histogram.
 */
export function monteCarloMetric(
  actual: number,
  def: MetricDefinition,
  seed: number,
  n: number = MONTE_CARLO_N,
  steps = 12
): MonteCarloResult {
  const rng = mulberry32(seed);
  const gaussian = makeGaussian(rng);
  const outcomes: number[] = [];
  const driftPerStep = (def.baseline - actual) / steps / 4; // gentle mean reversion
  for (let i = 0; i < n; i++) {
    let v = actual;
    for (let s = 0; s < steps; s++) {
      v = v + driftPerStep + gaussian() * (def.stdev / Math.sqrt(steps));
    }
    outcomes.push(v);
  }
  outcomes.sort((a, b) => a - b);
  const mean = outcomes.reduce((a, b) => a + b, 0) / outcomes.length;
  return {
    n,
    p5: percentile(outcomes, 5),
    p10: percentile(outcomes, 10),
    p25: percentile(outcomes, 25),
    p50: percentile(outcomes, 50),
    p75: percentile(outcomes, 75),
    p90: percentile(outcomes, 90),
    p95: percentile(outcomes, 95),
    mean,
    histogram: buildHistogram(outcomes, 24),
    seed,
  };
}

export function metricDomainLabel(domain: Domain): string {
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}
