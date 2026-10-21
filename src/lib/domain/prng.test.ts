import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createPrng, nextBernoulli, nextGaussian } from "./prng";

describe("createPrng", () => {
  it("is deterministic: same seed -> same sequence", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), fc.integer({ min: 1, max: 200 }), (seed, n) => {
        const a = createPrng(seed);
        const b = createPrng(seed);
        const seqA = Array.from({ length: n }, () => a.next());
        const seqB = Array.from({ length: n }, () => b.next());
        expect(seqA).toEqual(seqB);
      }),
    );
  });

  it("produces values within [0, 1)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), (seed) => {
        const prng = createPrng(seed);
        for (let i = 0; i < 500; i += 1) {
          const v = prng.next();
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(1);
        }
      }),
    );
  });

  it("different seeds diverge (not literally identical across 50 draws)", () => {
    const a = createPrng(1);
    const b = createPrng(2);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });
});

describe("nextBernoulli", () => {
  it("p=0 never succeeds, p close to 1 almost always succeeds", () => {
    const prng = createPrng(42);
    for (let i = 0; i < 100; i += 1) {
      expect(nextBernoulli(prng, 0)).toBe(0);
    }
    const prng2 = createPrng(42);
    let successes = 0;
    for (let i = 0; i < 1000; i += 1) {
      successes += nextBernoulli(prng2, 0.999999);
    }
    expect(successes).toBeGreaterThan(990);
  });
});

describe("nextGaussian", () => {
  it("sample mean/stddev over many draws approximate standard normal", () => {
    const prng = createPrng(7);
    const samples = Array.from({ length: 20000 }, () => nextGaussian(prng));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
    expect(mean).toBeCloseTo(0, 1);
    expect(Math.sqrt(variance)).toBeCloseTo(1, 1);
  });
});
