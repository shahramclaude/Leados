import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { runMonteCarlo } from "./montecarlo";

describe("Monte Carlo reproducibility", () => {
  it("same seed + same model + same trial count -> byte-identical output", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100000 }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: 0.01, max: 50, noNaN: true }),
        fc.integer({ min: 1, max: 500 }),
        (seed, mean, stdDev, trials) => {
          const a = runMonteCarlo({ mean, stdDev }, trials, seed);
          const b = runMonteCarlo({ mean, stdDev }, trials, seed);
          expect(a).toEqual(b);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("different seeds produce different sample paths", () => {
    const a = runMonteCarlo({ mean: 0, stdDev: 1 }, 100, 1);
    const b = runMonteCarlo({ mean: 0, stdDev: 1 }, 100, 2);
    expect(a.samples).not.toEqual(b.samples);
  });

  it("sample mean converges toward the model mean as trials grow", () => {
    const result = runMonteCarlo({ mean: 10, stdDev: 2 }, 50000, 123);
    expect(result.mean).toBeGreaterThan(9.8);
    expect(result.mean).toBeLessThan(10.2);
  });

  it("percentiles are monotonic: p05 <= p50 <= p95", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100000 }), (seed) => {
        const result = runMonteCarlo({ mean: 0, stdDev: 1 }, 1000, seed);
        expect(result.p05).toBeLessThanOrEqual(result.p50);
        expect(result.p50).toBeLessThanOrEqual(result.p95);
      }),
    );
  });

  it("rejects non-positive trial counts", () => {
    expect(() => runMonteCarlo({ mean: 0, stdDev: 1 }, 0, 1)).toThrow();
  });
});
