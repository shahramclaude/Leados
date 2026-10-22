// LEADOS — Part 39: the transparent fitness function.
//
//   Fitness = Σ_i n_i · D_i
//   where n_i = w_i / Σ_j w_j   (normalized dimension weight)
//         D_i = mean_{m in dimension i}( normalize(metric_m) )
//
// HONESTY RULE: the function is a declared, visible, user-adjustable weighted
// sum of normalized, evidence-classed raw metrics. There is no hidden term.
// Every number shown here is reproducible from (policy weights, raw metric
// values) using the formulas documented below and verified in
// scripts/verify-fitness.ts.
//
// SENSITIVITY (analytic, not numerical-finite-difference approximations):
//
//   ∂Fitness/∂w_i = (D_i − Fitness) / W      where W = Σ_j w_j
//     derivation: Fitness(w) = Σ_j (w_j/W) D_j is a ratio of linear forms in
//     w_i (since D_j does not depend on weights); quotient rule on the w_i
//     term plus the implicit dependence of every n_j on W gives exactly this.
//
//   ∂Fitness/∂value_m = n_i · (1/k_i) · ∂normalize(m)/∂value_m
//     where metric m belongs to dimension i which has k_i metrics, and
//     ∂normalize/∂value is from normalize.ts (zero outside the metric's bounds).

import type {
  DimensionDecomposition,
  FitnessResult,
  MetricDecomposition,
  WeightMap,
} from "./types";
import { DIMENSIONS, METRICS, getMetric, metricsForDimension } from "./dimensions";
import { normalizeDerivative, normalizeMetric } from "./normalize";

export interface ComputeFitnessOptions {
  weights: WeightMap;
  metricValues: Record<string, number>;
  policyId?: number | null;
  policyVersion?: number | null;
}

export function computeFitness(opts: ComputeFitnessOptions): FitnessResult {
  const { weights, metricValues } = opts;

  const missing = METRICS.filter((m) => metricValues[m.id] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Missing metric values for: ${missing.map((m) => m.id).join(", ")}. Every declared metric must have evidence before fitness can be computed.`,
    );
  }

  const totalRawWeight = DIMENSIONS.reduce((sum, d) => sum + (weights[d.id]?.weight ?? 0), 0);
  if (totalRawWeight <= 0) {
    throw new Error("Total raw weight must be positive.");
  }

  // Pass 1: compute D_i (dimension score) per dimension — independent of weights.
  const dimensionScores = new Map<string, number>();
  const metricDecompByDim = new Map<string, MetricDecomposition[]>();

  for (const dim of DIMENSIONS) {
    const metrics = metricsForDimension(dim.id);
    const normScores: number[] = [];
    const metricDecomps: MetricDecomposition[] = [];

    for (const metric of metrics) {
      const value = metricValues[metric.id];
      const normalizedScore = normalizeMetric(metric, value);
      normScores.push(normalizedScore);

      const counterMetric = getMetric(metric.counterMetricId);
      const counterValue = metricValues[counterMetric.id] ?? null;
      const counterNormalizedScore = counterValue === null ? null : normalizeMetric(counterMetric, counterValue);

      metricDecomps.push({
        id: metric.id,
        name: metric.name,
        unit: metric.unit,
        direction: metric.direction,
        evidenceClass: metric.evidenceClass,
        value,
        normalizedScore,
        goodhartRisk: metric.goodhartRisk,
        counterMetricId: metric.counterMetricId,
        counterRationale: metric.counterRationale,
        counterValue,
        counterNormalizedScore,
        sensitivity: 0, // filled in pass 2 once we know n_i
      });
    }

    const score = normScores.length > 0 ? normScores.reduce((a, b) => a + b, 0) / normScores.length : 0;
    dimensionScores.set(dim.id, score);
    metricDecompByDim.set(dim.id, metricDecomps);
  }

  // Fitness = Σ n_i D_i
  let fitness = 0;
  for (const dim of DIMENSIONS) {
    const w = weights[dim.id]?.weight ?? 0;
    const n = w / totalRawWeight;
    fitness += n * (dimensionScores.get(dim.id) ?? 0);
  }

  // Pass 2: assemble decomposition with weight + metric sensitivities.
  const dimensions: DimensionDecomposition[] = DIMENSIONS.map((dim) => {
    const w = weights[dim.id]?.weight ?? 0;
    const n = w / totalRawWeight;
    const score = dimensionScores.get(dim.id) ?? 0;
    const contribution = n * score;
    // ∂Fitness/∂w_i = (D_i - Fitness) / W
    const weightSensitivity = (score - fitness) / totalRawWeight;

    const metrics = metricsForDimension(dim.id);
    const k_i = metrics.length;
    const decomps = (metricDecompByDim.get(dim.id) ?? []).map((md) => {
      const metric = getMetric(md.id);
      const deriv = normalizeDerivative(metric, md.value);
      const sensitivity = k_i > 0 ? n * (1 / k_i) * deriv : 0;
      return { ...md, sensitivity };
    });

    return {
      id: dim.id,
      name: dim.name,
      description: dim.description,
      rawWeight: w,
      weightRationale: weights[dim.id]?.rationale ?? "(no rationale recorded)",
      normalizedWeight: n,
      score,
      contribution,
      weightSensitivity,
      metrics: decomps,
    };
  });

  return {
    fitness,
    totalRawWeight,
    policyId: opts.policyId ?? null,
    policyVersion: opts.policyVersion ?? null,
    dimensions,
    generatedAt: new Date().toISOString(),
  };
}

/** Sum of per-dimension contributions — must equal fitness (decomposability property). */
export function sumContributions(result: FitnessResult): number {
  return result.dimensions.reduce((s, d) => s + d.contribution, 0);
}
