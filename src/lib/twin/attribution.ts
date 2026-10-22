// src/lib/twin/attribution.ts
//
// Driver attribution: "what moved the outcome between two scenarios".
//
// Two complementary methods:
//  1. One-at-a-time (OAT): flip a single factor from its baseline value to
//     its intervention value and measure the change. Cheap, intuitive, but
//     ignores interactions and does not have to sum to the total effect.
//  2. Exact Shapley value over the factor powerset: for n<=8 factors we can
//     afford all 2^n coalitions. value(S) = ensemble-mean outcome when the
//     factors in S use their intervention value and the rest use baseline.
//     The Shapley value has the EFFICIENCY property:
//         sum_i phi_i = value(fullSet) - value(emptySet) = totalEffect
//     exactly (subject to Monte Carlo noise in value(S) estimates). We use
//     common random numbers (same seedBase for every coalition) so that
//     noise mostly cancels between coalitions, which is what lets the
//     ≤5% sum-error gate hold with a modest per-coalition run count.

import type {
  AttributionContribution,
  AttributionResult,
  MetricKey,
  ScenarioInput,
} from "./types";
import { runEnsemble } from "./ensemble";

export interface FactorDef {
  key: string;
  label: string;
  field: keyof ScenarioInput;
  baselineValue: unknown;
  interventionValue: unknown;
}

const FACTOR_PRIORITY: Array<{ field: keyof ScenarioInput; label: string }> = [
  { field: "headcountDeltaFraction", label: "Headcount change" },
  { field: "demandMultiplier", label: "Demand multiplier" },
  { field: "arrivalRateLambda", label: "Arrival rate (λ)" },
  { field: "wipLimit", label: "WIP limit" },
  { field: "effortMeanHrs", label: "Mean initiative effort" },
  { field: "costPerHeadWeek", label: "Cost per head/week" },
  { field: "valuePerEffortHr", label: "Value per effort hour" },
  { field: "queueDiscipline", label: "Queue discipline" },
  { field: "effortSpread", label: "Effort estimate spread" },
  { field: "orgSize", label: "Org size" },
];

export function buildFactorsFromScenarios(
  baseline: ScenarioInput,
  intervention: ScenarioInput,
  maxFactors = 8,
): FactorDef[] {
  const factors: FactorDef[] = [];
  for (const { field, label } of FACTOR_PRIORITY) {
    if (factors.length >= maxFactors) break;
    const b = baseline[field];
    const i = intervention[field];
    if (JSON.stringify(b) !== JSON.stringify(i)) {
      factors.push({ key: String(field), label, field, baselineValue: b, interventionValue: i });
    }
  }
  return factors;
}

function applyCoalition(baseline: ScenarioInput, factors: FactorDef[], mask: number): ScenarioInput {
  const out: ScenarioInput = { ...baseline };
  factors.forEach((f, idx) => {
    const useIntervention = (mask & (1 << idx)) !== 0;
    (out as unknown as Record<string, unknown>)[f.field as string] = useIntervention
      ? f.interventionValue
      : f.baselineValue;
  });
  return out;
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export interface AttributionOptions {
  runsPerCoalition?: number;
  metric?: MetricKey;
  maxFactors?: number;
}

export function computeAttribution(
  baseline: ScenarioInput,
  intervention: ScenarioInput,
  opts: AttributionOptions = {},
): AttributionResult {
  const metric: MetricKey = opts.metric ?? "cumulativeNetValue";
  const runsPerCoalition = opts.runsPerCoalition ?? 40;
  const factors = buildFactorsFromScenarios(baseline, intervention, opts.maxFactors ?? 8);
  const n = factors.length;

  if (n === 0) {
    return {
      metric,
      totalEffect: 0,
      sumOfShapley: 0,
      sumErrorPct: 0,
      contributions: [],
      coalitionsEvaluated: 0,
      runsPerCoalition,
    };
  }

  const numCoalitions = 1 << n;
  const valueCache = new Map<number, number>();

  const valueOf = (mask: number): number => {
    const cached = valueCache.get(mask);
    if (cached !== undefined) return cached;
    const scenario = applyCoalition(baseline, factors, mask);
    // Common random numbers across coalitions: same seedBase, no antithetic
    // needed here (CRN already cancels most noise; antithetic would double
    // run cost for marginal extra benefit at this sample size).
    const result = runEnsemble(scenario, {
      runs: runsPerCoalition,
      seedBase: baseline.seedBase,
      useAntithetic: true,
      useControlVariate: false,
    });
    const values = result.finalValues[metric];
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    valueCache.set(mask, mean);
    return mean;
  };

  // Precompute every coalition value once (2^n of them).
  for (let mask = 0; mask < numCoalitions; mask++) valueOf(mask);

  const fullMask = numCoalitions - 1;
  const totalEffect = valueOf(fullMask) - valueOf(0);

  const phi = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const bit = 1 << i;
    for (let mask = 0; mask < numCoalitions; mask++) {
      if (mask & bit) continue; // S must not contain i
      const sSize = popcount(mask);
      const weight = (factorial(sSize) * factorial(n - sSize - 1)) / factorial(n);
      const marginal = valueOf(mask | bit) - valueOf(mask);
      phi[i] += weight * marginal;
    }
  }

  const oatEffects = factors.map((_, i) => valueOf(1 << i) - valueOf(0));

  const sumOfShapley = phi.reduce((s, v) => s + v, 0);
  const sumErrorPct = totalEffect !== 0 ? (Math.abs(sumOfShapley - totalEffect) / Math.abs(totalEffect)) * 100 : 0;

  const contributions: AttributionContribution[] = factors.map((f, i) => ({
    factorKey: f.key,
    factorLabel: f.label,
    oatEffect: oatEffects[i],
    shapleyEffect: phi[i],
  }));
  contributions.sort((a, b) => Math.abs(b.shapleyEffect) - Math.abs(a.shapleyEffect));

  return {
    metric,
    totalEffect,
    sumOfShapley,
    sumErrorPct,
    contributions,
    coalitionsEvaluated: numCoalitions,
    runsPerCoalition,
  };
}

function popcount(x: number): number {
  let count = 0;
  while (x) {
    count += x & 1;
    x >>= 1;
  }
  return count;
}
