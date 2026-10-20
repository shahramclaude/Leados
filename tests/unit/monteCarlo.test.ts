import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { percentile, runMonteCarloForecast } from "@/lib/domain/monteCarlo";

describe("monteCarlo", () => {
  it("percentile is monotonic non-decreasing as p increases", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1000, max: 1000, noNaN: true }), { minLength: 1, maxLength: 200 }),
        (values) => {
          const sorted = [...values].sort((a, b) => a - b);
          const p10 = percentile(sorted, 0.1);
          const p50 = percentile(sorted, 0.5);
          const p90 = percentile(sorted, 0.9);
          expect(p10).toBeLessThanOrEqual(p50);
          expect(p50).toBeLessThanOrEqual(p90);
        },
      ),
    );
  });

  it("runMonteCarloForecast is deterministic given the same seed", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 10_000, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer(),
        (base, volatility, trials, seed) => {
          const a = runMonteCarloForecast({ base, volatility, trials, seed });
          const b = runMonteCarloForecast({ base, volatility, trials, seed });
          expect(a).toEqual(b);
        },
      ),
    );
  });

  it("result invariants hold: min <= p10 <= p50 <= p90 <= max, and trials matches sample count", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 10_000, noNaN: true }),
        fc.double({ min: 0, max: 2, noNaN: true }),
        fc.integer({ min: 1, max: 500 }),
        fc.integer(),
        (base, volatility, trials, seed) => {
          const result = runMonteCarloForecast({ base, volatility, trials, seed });
          expect(result.samples).toHaveLength(trials);
          expect(result.min).toBeLessThanOrEqual(result.p10);
          expect(result.p10).toBeLessThanOrEqual(result.p50);
          expect(result.p50).toBeLessThanOrEqual(result.p90);
          expect(result.p90).toBeLessThanOrEqual(result.max);
          expect(Number.isFinite(result.mean)).toBe(true);
          expect(result.stdDev).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it("zero volatility collapses every sample to base", () => {
    const result = runMonteCarloForecast({ base: 500, volatility: 0, trials: 50, seed: 1 });
    expect(result.min).toBeCloseTo(500);
    expect(result.max).toBeCloseTo(500);
    expect(result.stdDev).toBeCloseTo(0);
  });

  it("rejects non-positive trials and negative volatility", () => {
    expect(() => runMonteCarloForecast({ base: 1, volatility: 0.1, trials: 0, seed: 1 })).toThrow();
    expect(() => runMonteCarloForecast({ base: 1, volatility: -0.1, trials: 10, seed: 1 })).toThrow();
  });

  describe("percentile boundary conditions", () => {
    it("returns NaN for an empty array", () => {
      expect(Number.isNaN(percentile([], 0.5))).toBe(true);
    });

    it("clamps p <= 0 to the minimum and p >= 1 to the maximum", () => {
      const sorted = [1, 2, 3, 4, 5];
      expect(percentile(sorted, 0)).toBe(1);
      expect(percentile(sorted, -5)).toBe(1);
      expect(percentile(sorted, 1)).toBe(5);
      expect(percentile(sorted, 5)).toBe(5);
    });

    it("returns the exact value when the percentile lands exactly on an index", () => {
      expect(percentile([10, 20, 30], 0.5)).toBe(20);
    });
  });
});
