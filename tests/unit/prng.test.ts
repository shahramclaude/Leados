import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng, nextGaussian } from "@/lib/domain/prng";

describe("prng", () => {
  it("is deterministic: same seed produces the same sequence", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 50 }), (seed, n) => {
        const a = createRng(seed);
        const b = createRng(seed);
        const seqA = Array.from({ length: n }, () => a());
        const seqB = Array.from({ length: n }, () => b());
        expect(seqA).toEqual(seqB);
      }),
    );
  });

  it("always produces values in [0, 1)", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 200 }), (seed, n) => {
        const rng = createRng(seed);
        for (let i = 0; i < n; i++) {
          const v = rng();
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(1);
        }
      }),
    );
  });

  it("different seeds (almost always) produce different first values", () => {
    const a = createRng(1)();
    const b = createRng(2)();
    expect(a).not.toBe(b);
  });

  it("nextGaussian produces finite numbers and is deterministic for a fixed seed", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const rngA = createRng(seed);
        const rngB = createRng(seed);
        const a = nextGaussian(rngA);
        const b = nextGaussian(rngB);
        expect(Number.isFinite(a)).toBe(true);
        expect(a).toBe(b);
      }),
    );
  });
});
