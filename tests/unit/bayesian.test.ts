import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { betaCredibleBand, betaMean, betaVariance, updateBeta } from "@/lib/domain/bayesian";

const positiveParam = fc.double({ min: 0.1, max: 100, noNaN: true });
const nonNegativeInt = fc.integer({ min: 0, max: 1000 });

describe("bayesian", () => {
  it("posterior alpha/beta are never less than the prior (evidence only accumulates)", () => {
    fc.assert(
      fc.property(positiveParam, positiveParam, nonNegativeInt, nonNegativeInt, (alpha, beta, s, f) => {
        const prior = { alpha, beta };
        const posterior = updateBeta(prior, { successes: s, failures: f });
        expect(posterior.alpha).toBeGreaterThanOrEqual(prior.alpha);
        expect(posterior.beta).toBeGreaterThanOrEqual(prior.beta);
      }),
    );
  });

  it("betaMean is always strictly between 0 and 1 for positive params", () => {
    fc.assert(
      fc.property(positiveParam, positiveParam, (alpha, beta) => {
        const mean = betaMean({ alpha, beta });
        expect(mean).toBeGreaterThan(0);
        expect(mean).toBeLessThan(1);
      }),
    );
  });

  it("more success evidence (no failures) strictly increases the belief mean", () => {
    fc.assert(
      fc.property(positiveParam, positiveParam, fc.integer({ min: 1, max: 1000 }), (alpha, beta, successes) => {
        const prior = { alpha, beta };
        const posterior = updateBeta(prior, { successes, failures: 0 });
        expect(betaMean(posterior)).toBeGreaterThan(betaMean(prior));
      }),
    );
  });

  it("more failure evidence (no successes) strictly decreases the belief mean", () => {
    fc.assert(
      fc.property(positiveParam, positiveParam, fc.integer({ min: 1, max: 1000 }), (alpha, beta, failures) => {
        const prior = { alpha, beta };
        const posterior = updateBeta(prior, { successes: 0, failures });
        expect(betaMean(posterior)).toBeLessThan(betaMean(prior));
      }),
    );
  });

  it("variance is always non-negative", () => {
    fc.assert(
      fc.property(positiveParam, positiveParam, (alpha, beta) => {
        expect(betaVariance({ alpha, beta })).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("credible band is clamped to [0, 1] and low <= mean <= high", () => {
    fc.assert(
      fc.property(positiveParam, positiveParam, (alpha, beta) => {
        const params = { alpha, beta };
        const { low, high } = betaCredibleBand(params);
        const mean = betaMean(params);
        expect(low).toBeGreaterThanOrEqual(0);
        expect(high).toBeLessThanOrEqual(1);
        expect(low).toBeLessThanOrEqual(mean);
        expect(mean).toBeLessThanOrEqual(high);
      }),
    );
  });

  it("rejects non-positive priors and negative evidence", () => {
    expect(() => updateBeta({ alpha: 0, beta: 1 }, { successes: 1, failures: 0 })).toThrow();
    expect(() => updateBeta({ alpha: 1, beta: 1 }, { successes: -1, failures: 0 })).toThrow();
  });
});
