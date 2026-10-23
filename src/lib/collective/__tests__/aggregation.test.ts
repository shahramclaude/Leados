import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXTREMIZATION_A,
  aggregateForecasts,
  calibrationWeights,
  clip,
  extremize,
  fitExtremizationExponent,
  mean,
  meanBrier,
  stdDev,
} from "../aggregation";
import { simulateCalibrationWeightedPooling } from "../simulation";
import type { RawForecast } from "../types";

describe("extremization property tests", () => {
  it("stays within (0,1) bounds for the full domain", () => {
    for (let p = 0.01; p < 1; p += 0.01) {
      for (const a of [0.5, 1, 1.5, 2, 3]) {
        const out = extremize(p, a);
        expect(out).toBeGreaterThan(0);
        expect(out).toBeLessThan(1);
      }
    }
  });

  it("is the identity transform at a=1", () => {
    for (const p of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(extremize(p, 1)).toBeCloseTo(p, 5);
    }
  });

  it("is a fixed point at p=0.5 for any a", () => {
    for (const a of [0.3, 1, 1.5, 2, 5]) {
      expect(extremize(0.5, a)).toBeCloseTo(0.5, 6);
    }
  });

  it("pushes estimates above 0.5 further from 0.5 when a > 1 (more extreme)", () => {
    const p = 0.65;
    const extremized = extremize(p, 2);
    expect(extremized).toBeGreaterThan(p);
  });

  it("pulls estimates toward 0.5 when a < 1 (less extreme)", () => {
    const p = 0.65;
    const pulled = extremize(p, 0.5);
    expect(pulled).toBeLessThan(p);
    expect(pulled).toBeGreaterThan(0.5);
  });

  it("is monotonically increasing in p for fixed a (order-preserving)", () => {
    const a = DEFAULT_EXTREMIZATION_A;
    let prev = 0;
    for (let p = 0.05; p < 1; p += 0.05) {
      const out = extremize(p, a);
      expect(out).toBeGreaterThan(prev);
      prev = out;
    }
  });

  it("rejects a non-positive exponent", () => {
    expect(() => extremize(0.5, 0)).toThrow();
    expect(() => extremize(0.5, -1)).toThrow();
  });

  it("fits an exponent that is no worse than the unfit default on a synthetic panel", () => {
    const history = Array.from({ length: 200 }, (_, i) => {
      const truth = (i % 97) / 97;
      const outcome = (truth > 0.5 ? 1 : 0) as 0 | 1;
      return { pooledMean: truth, outcome };
    });
    const fit = fitExtremizationExponent(history);
    const defaultBrier = meanBrier(
      history.map((h) => ({ p: extremize(h.pooledMean, DEFAULT_EXTREMIZATION_A), outcome: h.outcome })),
    );
    expect(fit.brier).toBeLessThanOrEqual(defaultBrier + 1e-9);
  });
});

describe("calibration weighting", () => {
  it("weights sum to 1", () => {
    const forecasts: RawForecast[] = [
      { forecasterId: "a", probability: 0.6, calibrationScore: 0.9 },
      { forecasterId: "b", probability: 0.4, calibrationScore: 0.3 },
      { forecasterId: "c", probability: 0.5, calibrationScore: 0.1 },
    ];
    const weights = calibrationWeights(forecasts);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(weights[0]).toBeGreaterThan(weights[1]);
    expect(weights[1]).toBeGreaterThan(weights[2]);
  });

  it("falls back to uniform weights when no scores are provided", () => {
    const forecasts: RawForecast[] = [
      { forecasterId: "a", probability: 0.6 },
      { forecasterId: "b", probability: 0.4 },
    ];
    const weights = calibrationWeights(forecasts);
    expect(weights[0]).toBeCloseTo(weights[1], 6);
  });

  it("simulation: calibration-weighted pooling beats uniform pooling in expectation on a heterogeneous panel", () => {
    const result = simulateCalibrationWeightedPooling(42, 3000);
    expect(result.improvementVsUniform).toBeGreaterThan(0);
    expect(result.calibrationWeightedBrier).toBeLessThan(result.uniformMeanBrier);
  });
});

describe("aggregateForecasts + minority report preservation", () => {
  const forecasts: RawForecast[] = [
    { forecasterId: "a", probability: 0.55, rationale: "base rate", calibrationScore: 0.7 },
    { forecasterId: "b", probability: 0.6, rationale: "similar base rate", calibrationScore: 0.6 },
    { forecasterId: "c", probability: 0.95, rationale: "insider signal, high confidence", calibrationScore: 0.4 },
    { forecasterId: "d", probability: 0.5, rationale: "uncertain", calibrationScore: 0.5 },
  ];

  it("mean method never silently drops a divergent forecaster", () => {
    const result = aggregateForecasts(forecasts, { method: "mean" });
    const ids = result.minorityReports.map((r) => r.forecasterId);
    expect(ids).toContain("c");
    const report = result.minorityReports.find((r) => r.forecasterId === "c")!;
    expect(report.rationale).toBe("insider signal, high confidence");
  });

  // Note: extremization deliberately moves the aggregate TOWARD confident outliers (that
  // is its documented purpose), which can shrink a forecaster's divergence from the
  // aggregate. We therefore use an explicit, tighter threshold here to confirm the
  // minority-report mechanism still fires under extremization rather than assuming the
  // default threshold behaves identically across methods.
  it("extremized method also preserves the same minority voice (explicit threshold)", () => {
    const result = aggregateForecasts(forecasts, { method: "extremized", minorityThreshold: 0.15 });
    expect(result.minorityReports.map((r) => r.forecasterId)).toContain("c");
  });

  it("calibration_weighted method also preserves the same minority voice", () => {
    const result = aggregateForecasts(forecasts, { method: "calibration_weighted" });
    expect(result.minorityReports.map((r) => r.forecasterId)).toContain("c");
  });

  it("returns an empty minority list (not an error) when the panel agrees", () => {
    const tight: RawForecast[] = [
      { forecasterId: "a", probability: 0.5 },
      { forecasterId: "b", probability: 0.52 },
      { forecasterId: "c", probability: 0.48 },
    ];
    const result = aggregateForecasts(tight, { method: "mean" });
    expect(result.minorityReports).toEqual([]);
  });

  it("clip keeps probabilities within (0,1)", () => {
    expect(clip(1.5)).toBeLessThan(1);
    expect(clip(-0.5)).toBeGreaterThan(0);
  });

  it("mean/stdDev basic sanity", () => {
    expect(mean([0.2, 0.4, 0.6])).toBeCloseTo(0.4, 6);
    expect(stdDev([0.5, 0.5, 0.5])).toBeCloseTo(0, 6);
  });
});
