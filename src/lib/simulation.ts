/**
 * src/lib/simulation.ts — chunked, in-process Monte Carlo org-forecast
 * engine used by the `/api/forecast` route.
 *
 * Compute model note (mirrors the canonical repo's documented rationale for
 * `monteCarloWorker.ts` vs `monteCarlo.ts`): `worker_threads` + TypeScript
 * inside the Next.js server runtime is a real source of bundling/ESM-loader
 * fragility, so the HTTP request path deliberately uses this simpler
 * in-process engine, chunked with a macrotask yield every
 * `REPLICATIONS_PER_CHUNK` replications so a 2,000-run ensemble never blocks
 * the Node event loop for a single long task. True multi-core throughput
 * (worker_threads) is exercised instead by the offline `npm run sim:bench`
 * CLI via `src/workers/monteCarloWorker.ts`, which is never imported by any
 * route and therefore never enters the Next.js server bundle.
 *
 * Each replication projects a tenant's headcount risk-weighted "effective
 * capacity" forward `horizonWeeks` weeks under random attrition/hiring
 * shocks drawn from a seeded PRNG, so the whole run is reproducible from
 * (tenantId, scenarioKey, inputsHash).
 */
import { mulberry32, randNormal, seedFromString, clamp } from "./mathUtils";
import { summarizeDistribution, type Distribution } from "./stats";

export interface SimInputs {
  tenantId: string;
  scenarioKey: string;
  inputsHash: string;
  headcount: number;
  avgRisk: number; // 0..1, mean attrition-risk score across the roster
  horizonWeeks: number;
  replications: number;
}

export interface ForecastSeriesPoint {
  week: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface SimResult {
  final: Distribution;
  series: ForecastSeriesPoint[];
  replicationsCompleted: number;
  durationMs: number;
}

const REPLICATIONS_PER_CHUNK = 50;

/** Runs one replication: a headcount random walk influenced by avgRisk. */
function runOneReplication(rand: () => number, headcount: number, avgRisk: number, horizonWeeks: number): number[] {
  let capacity = headcount;
  const series: number[] = [];
  const weeklyAttritionBase = 0.004 + avgRisk * 0.01; // 0.4%-1.4%/week base hazard
  for (let week = 0; week < horizonWeeks; week++) {
    const shock = randNormal(rand, 0, 0.6);
    const hazard = clamp(weeklyAttritionBase * (1 + shock), 0, 0.08);
    const leavers = capacity * hazard;
    const hires = capacity * 0.006 * (1 + randNormal(rand, 0, 0.3));
    capacity = Math.max(0, capacity - leavers + hires);
    series.push(capacity);
  }
  return series;
}

/**
 * Runs the ensemble in yielded chunks so the caller's event loop stays
 * responsive. `onProgress` fires after every chunk for SSE/polling progress
 * reporting; `signal` allows cooperative cancellation (queue eviction).
 */
export async function runForecastEnsemble(
  inputs: SimInputs,
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal,
): Promise<SimResult> {
  const start = Date.now();
  const seed = seedFromString(inputs.inputsHash);
  const rootRand = mulberry32(seed);

  const perWeekSamples: number[][] = Array.from({ length: inputs.horizonWeeks }, () => []);
  const finals: number[] = [];

  let completed = 0;
  while (completed < inputs.replications) {
    if (signal?.aborted) break;
    const chunkEnd = Math.min(completed + REPLICATIONS_PER_CHUNK, inputs.replications);
    for (let r = completed; r < chunkEnd; r++) {
      // Derive a per-replication seed from the root stream so replications
      // are independent but the whole ensemble is reproducible.
      const repRand = mulberry32((seed ^ (r * 2654435761)) >>> 0);
      void rootRand; // root stream reserved for future antithetic pairing
      const series = runOneReplication(repRand, inputs.headcount, inputs.avgRisk, inputs.horizonWeeks);
      series.forEach((v, week) => perWeekSamples[week].push(v));
      finals.push(series[series.length - 1]);
    }
    completed = chunkEnd;
    onProgress?.(completed, inputs.replications);
    // Yield to the event loop between chunks — this is the mechanism that
    // keeps any single macrotask under ~50ms during heavy simulation; see
    // docs/PERFORMANCE.md "main-thread long task" evidence.
    await new Promise((resolve) => setImmediate(resolve));
  }

  const series: ForecastSeriesPoint[] = perWeekSamples.map((samples, week) => {
    const d = summarizeDistribution(samples);
    return { week: week + 1, p10: d.p10, p50: d.p50, p90: d.p90 };
  });

  return {
    final: summarizeDistribution(finals),
    series,
    replicationsCompleted: completed,
    durationMs: Date.now() - start,
  };
}
