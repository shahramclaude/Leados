// src/lib/intelligence/monteCarlo.ts
//
// Forecasting with uncertainty (Part 3 §5). Every forecast is a predictive
// distribution, summarised as p10/p50/p90 (not a single number), computed
// by Monte Carlo sampling of a declared generative model. Scenario deltas
// shift the model's parameters (not the output), so the causal story stays
// intact. Trials are chunked and yielded asynchronously so the same
// function can be called from a browser Web Worker (see
// src/workers/forecastWorker.ts) without blocking the main thread, and from
// the server without blocking the event loop.
export interface ForecastDriver {
  name: string;
  /** mean of this driver's contribution to the forecast, in output units */
  mean: number;
  /** standard deviation of this driver's contribution */
  stdDev: number;
}

export interface ScenarioAdjustment {
  name: string;
  /** additive shift applied to a named driver's mean before sampling */
  driverDeltas: Record<string, number>;
}

export interface MonteCarloInput {
  subject: string;
  drivers: ForecastDriver[];
  trials?: number;
  /** deterministic seed so results (and tests) are reproducible */
  seed?: number;
  scenario?: ScenarioAdjustment;
}

export interface PredictiveDistribution {
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  stdDev: number;
}

export interface AccuracyScore {
  metric: "MAPE" | "pinball-loss";
  value: number;
  historyPoints: number;
}

export interface MonteCarloResult {
  subject: string;
  scenario: string;
  distribution: PredictiveDistribution;
  assumptions: string[];
  trials: number;
  seed: number;
  asOf: string;
  accuracy?: AccuracyScore;
}

/** mulberry32 PRNG — small, fast, deterministic given a seed. We need
 * determinism (not cryptographic randomness) so forecasts are reproducible
 * in tests and so re-running with the same evidence yields the same answer
 * (cache invalidates on evidence change, not randomness). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleNormal(rng: () => number, mean: number, stdDev: number): number {
  // Box-Muller transform.
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * stdDev;
}

/** Summarises an arbitrary (already-sampled) set of trial outcomes into the
 * same p10/p50/p90 shape as runMonteCarlo's output, for callers (like
 * scenarioEngine.ts) that generate samples via a domain-specific model
 * (e.g. an ODE integration) rather than the generic driver-sum model above. */
export function summarizeDistribution(samples: number[]): PredictiveDistribution {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / sorted.length;
  return {
    p10: percentile(sorted, 0.1),
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    mean,
    stdDev: Math.sqrt(variance),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

const DEFAULT_TRIALS = 5000;
const CHUNK_SIZE = 1000;

/** Runs the Monte Carlo simulation, yielding control between chunks via a
 * microtask so large trial counts never block the event loop — this is the
 * same chunking strategy used inside the Web Worker wrapper, so the core
 * math is identical whether it executes on the server or in-browser. */
export async function runMonteCarlo(input: MonteCarloInput): Promise<MonteCarloResult> {
  const trials = input.trials ?? DEFAULT_TRIALS;
  const seed = input.seed ?? 42;
  const rng = mulberry32(seed);
  const results: number[] = [];
  const assumptions = [
    `${input.drivers.length} independent normally-distributed driver(s): ${input.drivers.map((d) => d.name).join(", ")}.`,
    "Drivers are summed (no interaction terms modelled) unless a scenario explicitly adjusts a driver's mean.",
    `${trials} Monte Carlo trials, seeded (seed=${seed}) for reproducibility.`,
  ];
  if (input.scenario) {
    assumptions.push(
      `Scenario "${input.scenario.name}" applied as additive shifts to driver means: ${JSON.stringify(input.scenario.driverDeltas)}.`,
    );
  }

  for (let start = 0; start < trials; start += CHUNK_SIZE) {
    const end = Math.min(trials, start + CHUNK_SIZE);
    for (let i = start; i < end; i++) {
      let total = 0;
      for (const driver of input.drivers) {
        const delta = input.scenario?.driverDeltas[driver.name] ?? 0;
        total += sampleNormal(rng, driver.mean + delta, driver.stdDev);
      }
      results.push(total);
    }
    // Yield to the event loop between chunks (what a Web Worker would do
    // between postMessage progress updates).
    await Promise.resolve();
  }

  results.sort((a, b) => a - b);
  const sum = results.reduce((a, b) => a + b, 0);
  const mean = sum / results.length;
  const variance = results.reduce((acc, v) => acc + (v - mean) ** 2, 0) / results.length;

  return {
    subject: input.subject,
    scenario: input.scenario?.name ?? "baseline",
    distribution: {
      p10: percentile(results, 0.1),
      p50: percentile(results, 0.5),
      p90: percentile(results, 0.9),
      mean,
      stdDev: Math.sqrt(variance),
    },
    assumptions,
    trials,
    seed,
    asOf: new Date().toISOString(),
  };
}

export interface ForecastHistoryPoint {
  predictedP50: number;
  actual: number;
}

/** Mean Absolute Percentage Error between historical p50 forecasts and what
 * actually happened — the "accuracy score from as-of history" required by
 * Part 3 §5. Requires the as-of forecast snapshots that Part 2's history
 * tracking produces; callers pass that history in. */
export function accuracyFromHistory(history: ForecastHistoryPoint[]): AccuracyScore | undefined {
  if (history.length === 0) return undefined;
  const errors = history.map((h) => Math.abs((h.actual - h.predictedP50) / (h.actual === 0 ? 1 : h.actual)));
  const mape = errors.reduce((a, b) => a + b, 0) / errors.length;
  return { metric: "MAPE", value: mape, historyPoints: history.length };
}
