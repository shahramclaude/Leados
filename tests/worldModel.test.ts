import { describe, expect, it } from "vitest";
import { gaussian, mean, mulberry32, percentile, stddev } from "@/lib/rng";
import {
  backtestSeriesInMemory,
  fitLinearTrend,
  predictionSE,
  simulateMonteCarlo,
  type ObservationPoint,
} from "@/lib/worldModelCore";
import { generateSyntheticSeries } from "@/lib/syntheticData";
import {
  createMetricSchema,
  createObservationSchema,
  runSimulationSchema,
  MAX_TRIALS,
  MAX_HORIZON,
} from "@/lib/validation";

function series(values: number[]): ObservationPoint[] {
  return values.map((value, i) => ({ period: `2024-${String(i + 1).padStart(2, "0")}-01`, value }));
}

describe("rng: mulberry32 + gaussian", () => {
  it("is deterministic — same seed produces the same stream", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds diverge", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("gaussian samples have approximately mean 0, std 1 over a large sample", () => {
    const rand = mulberry32(7);
    const samples = Array.from({ length: 20000 }, () => gaussian(rand));
    expect(Math.abs(mean(samples))).toBeLessThan(0.05);
    expect(Math.abs(stddev(samples) - 1)).toBeLessThan(0.05);
  });
});

describe("percentile()", () => {
  it("matches known quantiles on a simple sorted array", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(xs, 50)).toBeCloseTo(5.5, 5);
    expect(percentile(xs, 0)).toBe(1);
    expect(percentile(xs, 100)).toBe(10);
  });
});

describe("fitLinearTrend()", () => {
  it("recovers a known slope/intercept from noise-free data", () => {
    const pts = series([10, 15, 20, 25, 30]); // intercept 10, slope 5
    const fit = fitLinearTrend(pts);
    expect(fit.intercept).toBeCloseTo(10, 6);
    expect(fit.slope).toBeCloseTo(5, 6);
    expect(fit.residualStd).toBeGreaterThan(0); // floor applies even with zero residuals
  });

  it("handles n < 2 gracefully instead of throwing", () => {
    const fit = fitLinearTrend(series([42]));
    expect(fit.slope).toBe(0);
    expect(fit.intercept).toBe(42);
    expect(fit.n).toBe(1);
  });

  it("handles an empty series without throwing", () => {
    const fit = fitLinearTrend([]);
    expect(fit.n).toBe(0);
    expect(Number.isFinite(fit.residualStd)).toBe(true);
  });
});

describe("predictionSE()", () => {
  it("grows with the forecast horizon (further out = less certain)", () => {
    const fit = fitLinearTrend(series([10, 12, 11, 14, 13, 16, 15, 18]));
    const se1 = predictionSE(fit, 1);
    const se12 = predictionSE(fit, 12);
    expect(se12).toBeGreaterThan(se1);
  });
});

describe("simulateMonteCarlo()", () => {
  const fit = fitLinearTrend(series([100, 110, 120, 130, 140]));

  it("is deterministic — identical inputs (incl. seed) produce byte-identical bands", () => {
    const r1 = simulateMonteCarlo(fit, 140, 6, 500, 123);
    const r2 = simulateMonteCarlo(fit, 140, 6, 500, 123);
    expect(r1.bands).toEqual(r2.bands);
  });

  it("different seeds produce different (but structurally valid) bands", () => {
    const r1 = simulateMonteCarlo(fit, 140, 6, 500, 1);
    const r2 = simulateMonteCarlo(fit, 140, 6, 500, 2);
    expect(r1.bands).not.toEqual(r2.bands);
  });

  it("every band has p10 <= p50 <= p90", () => {
    const { bands } = simulateMonteCarlo(fit, 140, 12, 800, 99);
    for (const b of bands) {
      expect(b.p10).toBeLessThanOrEqual(b.p50);
      expect(b.p50).toBeLessThanOrEqual(b.p90);
    }
  });

  it("an intervention (do-calculus surgery) shifts the post-intervention mean toward the forced delta", () => {
    // Organic slope is +10/step. Force the slope to -50/step from step 3 onward.
    const flat = fitLinearTrend(series([1000, 1010, 1020, 1030, 1040]));
    const withoutIntervention = simulateMonteCarlo(flat, 1040, 6, 3000, 55);
    const withIntervention = simulateMonteCarlo(flat, 1040, 6, 3000, 55, { fromStep: 3, delta: -50 });
    const lastStep = 6;
    const meanWithout = withoutIntervention.bands[lastStep - 1].mean;
    const meanWith = withIntervention.bands[lastStep - 1].mean;
    expect(meanWith).toBeLessThan(meanWithout - 100); // materially different trajectory
  });

  it("caps intervention effect strictly before fromStep (no leakage backwards)", () => {
    const flat = fitLinearTrend(series([1000, 1010, 1020, 1030, 1040]));
    const withIntervention = simulateMonteCarlo(flat, 1040, 6, 4000, 7, { fromStep: 4, delta: -1000 });
    // Step 1-3 should still look like the organic (+10/step) trend on average, not the -1000 intervention.
    const step2Mean = withIntervention.bands[1].mean; // step index 2
    expect(step2Mean).toBeGreaterThan(900); // nowhere near a -1000/step collapse
  });
});

describe("backtestSeriesInMemory()", () => {
  it("never uses data beyond the cutoff (no look-ahead leakage)", () => {
    // A series with a dramatic shock in the final period only; fitting on
    // a window that excludes the shock must not "see" it.
    const pts = series([100, 102, 101, 103, 104, 103, 105, 999999]);
    const results = backtestSeriesInMemory(pts, 1, 500, 1, 4);
    // The forecast for the shock (target index 7) is computed from a fit
    // that did not include index 7 — so its P90 should be nowhere near 999999.
    const shockResult = results.find((r) => r.targetIndex === 7);
    expect(shockResult).toBeDefined();
    expect(shockResult!.p90).toBeLessThan(10000);
    expect(shockResult!.withinInterval).toBe(false); // the shock is correctly flagged as a miss
  });

  it("produces a plausible overall coverage rate on a realistic synthetic series", () => {
    const pts = generateSyntheticSeries({ n: 36, intercept: 500, slope: 8, noiseStd: 20, seed: 55 });
    const results = backtestSeriesInMemory(pts, 3, 1200, 10);
    const within = results.filter((r) => r.withinInterval).length;
    const coverage = within / results.length;
    // Not asserting a razor-thin bound here (that's eval:worldmodel's job across
    // many series) — just that it's in a sane neighborhood of 80%, not 0% or 100%.
    expect(coverage).toBeGreaterThan(0.4);
    expect(coverage).toBeLessThanOrEqual(1);
  });
});

describe("validation schemas (API boundary hardening)", () => {
  it("rejects a metric key with disallowed characters (defense against odd input, not just SQL)", () => {
    const result = createMetricSchema.safeParse({ key: "DROP TABLE metrics;--", name: "x" });
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed metric", () => {
    const result = createMetricSchema.safeParse({ key: "mrr", name: "MRR", unit: "USD" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-ISO observation period", () => {
    const result = createObservationSchema.safeParse({ period: "not-a-date", value: 10 });
    expect(result.success).toBe(false);
  });

  it("rejects trials above MAX_TRIALS and below the floor", () => {
    expect(
      runSimulationSchema.safeParse({ metricId: "11111111-1111-1111-1111-111111111111", horizon: 6, trials: MAX_TRIALS + 1, seed: 1 }).success,
    ).toBe(false);
    expect(
      runSimulationSchema.safeParse({ metricId: "11111111-1111-1111-1111-111111111111", horizon: 6, trials: 1, seed: 1 }).success,
    ).toBe(false);
  });

  it("rejects horizon above MAX_HORIZON", () => {
    expect(
      runSimulationSchema.safeParse({ metricId: "11111111-1111-1111-1111-111111111111", horizon: MAX_HORIZON + 1, trials: 100, seed: 1 })
        .success,
    ).toBe(false);
  });

  it("rejects an interventionFromStep beyond the horizon", () => {
    const result = runSimulationSchema.safeParse({
      metricId: "11111111-1111-1111-1111-111111111111",
      horizon: 3,
      trials: 100,
      seed: 1,
      interventionFromStep: 5,
      interventionDelta: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects interventionFromStep without interventionDelta (must be paired)", () => {
    const result = runSimulationSchema.safeParse({
      metricId: "11111111-1111-1111-1111-111111111111",
      horizon: 6,
      trials: 100,
      seed: 1,
      interventionFromStep: 2,
    });
    expect(result.success).toBe(false);
  });
});

describe("generateSyntheticSeries()", () => {
  it("is deterministic for a fixed seed", () => {
    const a = generateSyntheticSeries({ n: 10, intercept: 100, slope: 2, noiseStd: 5, seed: 9 });
    const b = generateSyntheticSeries({ n: 10, intercept: 100, slope: 2, noiseStd: 5, seed: 9 });
    expect(a).toEqual(b);
  });
});
