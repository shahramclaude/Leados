import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  priorBeta,
  updateBeta,
  updateBetaBatch,
  meanBeta,
  varianceBeta,
  totalCount,
  credibleInterval,
} from "./beta";
import { arbBetaOutcomes } from "../../../tests/fixtures/generators";

describe("beta — example-based", () => {
  it("defaults to the uniform Beta(1,1) prior", () => {
    const prior = priorBeta();
    expect(prior).toEqual({ alpha: 1, beta: 1 });
    expect(meanBeta(prior)).toBeCloseTo(0.5);
  });

  it("rejects non-positive prior parameters", () => {
    expect(() => priorBeta(0, 1)).toThrow();
    expect(() => priorBeta(1, -1)).toThrow();
  });

  it("moves the mean up after a success and down after a failure", () => {
    const prior = priorBeta();
    const afterSuccess = updateBeta(prior, true);
    const afterFailure = updateBeta(prior, false);
    expect(meanBeta(afterSuccess)).toBeGreaterThan(meanBeta(prior));
    expect(meanBeta(afterFailure)).toBeLessThan(meanBeta(prior));
  });

  it("credible interval narrows as more data accumulates", () => {
    let state = priorBeta();
    const wide = credibleInterval(state);
    for (let i = 0; i < 100; i++) state = updateBeta(state, i % 2 === 0);
    const narrow = credibleInterval(state);
    expect(narrow.upper - narrow.lower).toBeLessThan(wide.upper - wide.lower);
  });
});

describe("beta — property-based", () => {
  it("alpha + beta grows by exactly 1 per observation (conservation)", () => {
    fc.assert(
      fc.property(arbBetaOutcomes, (outcomes) => {
        const prior = priorBeta();
        const finalState = outcomes.reduce(
          (s, outcome) => updateBeta(s, outcome),
          prior,
        );
        expect(totalCount(finalState)).toBe(
          totalCount(prior) + outcomes.length,
        );
      }),
    );
  });

  it("sequential update order does not matter (commutativity) — matches batch update", () => {
    fc.assert(
      fc.property(arbBetaOutcomes, (outcomes) => {
        const prior = priorBeta(2, 3);
        const sequential = outcomes.reduce(
          (s, outcome) => updateBeta(s, outcome),
          prior,
        );
        const shuffled = [...outcomes].reverse();
        const sequentialReversed = shuffled.reduce(
          (s, outcome) => updateBeta(s, outcome),
          prior,
        );
        const batch = updateBetaBatch(prior, outcomes);

        expect(sequential).toEqual(sequentialReversed);
        expect(sequential).toEqual(batch);
      }),
    );
  });

  it("mean is always within (0, 1) and moves toward the empirical success rate", () => {
    // NOTE: use a dedicated minLength-bounded arbitrary rather than
    // `arbBetaOutcomes.filter(o => o.length > 20)` — fast-check's default
    // size heuristics almost never draw arrays long enough to pass that
    // filter, which previously caused "too many pre-condition failures"
    // (or, with .filter(), an effectively unbounded retry hang). Bounding
    // the arbitrary directly is both correct and fast.
    const arbLongerOutcomes = fc.array(fc.boolean(), {
      minLength: 21,
      maxLength: 200,
    });
    fc.assert(
      fc.property(
        arbLongerOutcomes,
        (outcomes) => {
          const prior = priorBeta();
          const finalState = outcomes.reduce(
            (s, outcome) => updateBeta(s, outcome),
            prior,
          );
          const mean = meanBeta(finalState);
          const empirical = outcomes.filter(Boolean).length / outcomes.length;
          expect(mean).toBeGreaterThan(0);
          expect(mean).toBeLessThan(1);
          // With enough data the Bayesian mean must be close to the
          // empirical rate (prior washes out).
          expect(Math.abs(mean - empirical)).toBeLessThan(0.15);
        },
      ),
    );
  });

  it("variance is always bounded in (0, 0.25] regardless of path", () => {
    fc.assert(
      fc.property(arbBetaOutcomes, (outcomes) => {
        let state = priorBeta();
        for (const outcome of outcomes) {
          state = updateBeta(state, outcome);
          const v = varianceBeta(state);
          expect(v).toBeGreaterThan(0);
          expect(v).toBeLessThanOrEqual(0.25);
        }
      }),
    );
  });

  /**
   * Law of total variance: Var(theta) = E[Var(theta|D)] + Var(E[theta|D]).
   * Since Var(E[theta|D]) >= 0, the *expected* posterior variance after one
   * more observation (drawn from the posterior predictive, i.e. with
   * probability = current mean) can never exceed the current variance.
   * Note this is an *expectation* property, not a path-wise guarantee: a
   * single surprising observation in a very skewed state CAN increase
   * variance along one branch (e.g. a rare success deep in a
   * failure-dominated history) — that asymmetry is itself part of what
   * makes Beta-Bernoulli updating a faithful uncertainty model, so a
   * path-wise-monotonic property would be mathematically false and is
   * intentionally NOT asserted here.
   */
  it("expected next-step variance (law of total variance) never exceeds current variance", () => {
    fc.assert(
      fc.property(
        arbBetaOutcomes.filter((o) => o.length <= 60),
        (outcomes) => {
          let state = priorBeta();
          for (const outcome of outcomes) state = updateBeta(state, outcome);

          const p = meanBeta(state);
          const varianceIfSuccess = varianceBeta(updateBeta(state, true));
          const varianceIfFailure = varianceBeta(updateBeta(state, false));
          const expectedNextVariance =
            p * varianceIfSuccess + (1 - p) * varianceIfFailure;

          expect(expectedNextVariance).toBeLessThanOrEqual(
            varianceBeta(state) + 1e-9,
          );
        },
      ),
    );
  });
});
