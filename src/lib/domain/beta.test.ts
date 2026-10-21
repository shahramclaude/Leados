import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  betaCredibleInterval,
  betaMean,
  betaUpdate,
  betaUpdateBatch,
  betaVariance,
  createBetaPrior,
} from "./beta";

describe("Beta-Bernoulli updating invariants", () => {
  it("alpha + beta increases by exactly 1 per observation", () => {
    fc.assert(
      fc.property(
        fc.record({ alpha: fc.double({ min: 0.1, max: 100, noNaN: true }), beta: fc.double({ min: 0.1, max: 100, noNaN: true }) }),
        fc.constantFrom(0, 1),
        (prior, outcome) => {
          const before = prior.alpha + prior.beta;
          const after = betaUpdate(prior, outcome as 0 | 1);
          expect(after.alpha + after.beta).toBeCloseTo(before + 1, 10);
        },
      ),
    );
  });

  it("is order-independent (commutative in outcome counts)", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(0, 1), { minLength: 0, maxLength: 50 }), (outcomes) => {
        const prior = createBetaPrior(1, 1);
        const forward = betaUpdateBatch(prior, outcomes as (0 | 1)[]);
        const reversed = betaUpdateBatch(prior, [...outcomes].reverse() as (0 | 1)[]);
        expect(forward.alpha).toBeCloseTo(reversed.alpha, 10);
        expect(forward.beta).toBeCloseTo(reversed.beta, 10);
      }),
    );
  });

  it("mean moves toward 1 after a success and toward 0 after a failure", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 50, noNaN: true }),
        fc.double({ min: 0.5, max: 50, noNaN: true }),
        (alpha, beta) => {
          const prior = createBetaPrior(alpha, beta);
          const afterSuccess = betaUpdate(prior, 1);
          const afterFailure = betaUpdate(prior, 0);
          expect(betaMean(afterSuccess)).toBeGreaterThan(betaMean(prior));
          expect(betaMean(afterFailure)).toBeLessThan(betaMean(prior));
        },
      ),
    );
  });

  it("mean is always within (0, 1) and variance is non-negative", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 1000, noNaN: true }),
        fc.double({ min: 0.01, max: 1000, noNaN: true }),
        (alpha, beta) => {
          const params = createBetaPrior(alpha, beta);
          const mean = betaMean(params);
          expect(mean).toBeGreaterThan(0);
          expect(mean).toBeLessThan(1);
          expect(betaVariance(params)).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it("more data shrinks the credible interval width (more confidence)", () => {
    const small = createBetaPrior(2, 2);
    const large = betaUpdateBatch(small, Array(200).fill(1) as (0 | 1)[]).alpha
      ? betaUpdateBatch(small, [...Array(100).fill(1), ...Array(100).fill(0)] as (0 | 1)[])
      : small;
    const widthSmall = betaCredibleInterval(small).upper - betaCredibleInterval(small).lower;
    const widthLarge = betaCredibleInterval(large).upper - betaCredibleInterval(large).lower;
    expect(widthLarge).toBeLessThan(widthSmall);
  });

  it("rejects non-positive priors", () => {
    expect(() => createBetaPrior(0, 1)).toThrow();
    expect(() => createBetaPrior(1, -1)).toThrow();
  });
});
