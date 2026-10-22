import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createPrng } from "@/lib/prng";
import { runMonteCarlo, samplePertDuration } from "./montecarlo";
import { arbSeed } from "../../../tests/fixtures/generators";

describe("montecarlo — example-based", () => {
  it("rejects a non-positive trial count", () => {
    expect(() => runMonteCarlo(0, () => 1, createPrng(1))).toThrow();
    expect(() => runMonteCarlo(-5, () => 1, createPrng(1))).toThrow();
  });

  it("percentile rejects out-of-range input", () => {
    const result = runMonteCarlo(10, (p) => p.next(), createPrng(42));
    expect(() => result.percentile(-1)).toThrow();
    expect(() => result.percentile(101)).toThrow();
  });

  it("computes a sane summary for a constant sampler", () => {
    const result = runMonteCarlo(50, () => 7, createPrng(1));
    expect(result.mean).toBe(7);
    expect(result.stdDev).toBe(0);
    expect(result.min).toBe(7);
    expect(result.max).toBe(7);
    expect(result.percentile(50)).toBe(7);
  });
});

describe("montecarlo — reproducibility (the core contract)", () => {
  it("identical seed produces byte-identical samples, mean, and percentiles", () => {
    fc.assert(
      fc.property(arbSeed, fc.integer({ min: 10, max: 500 }), (seed, trials) => {
        const sample = (p: ReturnType<typeof createPrng>) => p.nextGaussian(0, 1);
        const run1 = runMonteCarlo(trials, sample, createPrng(seed));
        const run2 = runMonteCarlo(trials, sample, createPrng(seed));

        expect(run1.samples).toEqual(run2.samples);
        expect(run1.mean).toBe(run2.mean);
        expect(run1.stdDev).toBe(run2.stdDev);
        expect(run1.percentile(90)).toBe(run2.percentile(90));
      }),
    );
  });

  it("different seeds (almost always) produce different sample sequences", () => {
    fc.assert(
      fc.property(arbSeed, arbSeed, (seedA, seedB) => {
        fc.pre(seedA !== seedB);
        const sample = (p: ReturnType<typeof createPrng>) => p.next();
        const runA = runMonteCarlo(50, sample, createPrng(seedA));
        const runB = runMonteCarlo(50, sample, createPrng(seedB));
        expect(runA.samples).not.toEqual(runB.samples);
      }),
    );
  });

  it("is reproducible end-to-end through samplePertDuration", () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const run = () =>
          runMonteCarlo(
            200,
            (p) => samplePertDuration(p, 1, 3, 10),
            createPrng(seed),
          );
        const a = run();
        const b = run();
        expect(a.samples).toEqual(b.samples);
      }),
    );
  });
});

describe("montecarlo — samplePertDuration bounds", () => {
  it("always samples within [optimistic, pessimistic]", () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const prng = createPrng(seed);
        for (let i = 0; i < 100; i++) {
          const v = samplePertDuration(prng, 2, 5, 20);
          expect(v).toBeGreaterThanOrEqual(2 - 1e-9);
          expect(v).toBeLessThanOrEqual(20 + 1e-9);
        }
      }),
    );
  });
});
