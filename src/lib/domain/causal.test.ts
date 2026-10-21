import { describe, expect, it } from "vitest";
import { createPrng, nextBernoulli, nextGaussian, type Prng } from "./prng";
import { estimateDifferenceInMeans, estimateIPW, type Unit } from "./causal";

/**
 * Synthetic ground truth: outcome = baseline + confound*covariate +
 * trueEffect*treated + noise, where treatment assignment is itself a
 * function of the covariate (confounding). IPW, given correctly specified
 * propensities, must recover `trueEffect`; naive difference-in-means must
 * not (it is biased by the confound).
 */
function generateConfoundedData(prng: Prng, n: number, trueEffect: number, confound: number): Unit[] {
  const units: Unit[] = [];
  for (let i = 0; i < n; i += 1) {
    const covariate = nextGaussian(prng); // z in N(0,1)
    // Propensity increases with covariate (logistic link) -> confounding.
    const logit = 1.2 * covariate;
    const propensity = 1 / (1 + Math.exp(-logit));
    const clampedPropensity = Math.min(0.97, Math.max(0.03, propensity));
    const treated = nextBernoulli(prng, clampedPropensity) === 1;
    const noise = nextGaussian(prng) * 0.5;
    const outcome = 5 + confound * covariate + (treated ? trueEffect : 0) + noise;
    units.push({ treated, outcome, propensity: clampedPropensity });
  }
  return units;
}

describe("Causal estimator ground-truth recovery", () => {
  it("IPW recovers the true average treatment effect under confounding (within tolerance)", () => {
    const prng = createPrng(2024);
    const trueEffect = 3;
    const units = generateConfoundedData(prng, 20000, trueEffect, /* confound */ 4);
    const ipw = estimateIPW(units);
    expect(ipw).toBeGreaterThan(trueEffect - 0.3);
    expect(ipw).toBeLessThan(trueEffect + 0.3);
  });

  it("naive difference-in-means is biased under the same confounded data (demonstrates why IPW is needed)", () => {
    const prng = createPrng(2024);
    const trueEffect = 3;
    const units = generateConfoundedData(prng, 20000, trueEffect, /* confound */ 4);
    const naive = estimateDifferenceInMeans(units);
    // The confound inflates the naive estimate well past the true effect.
    expect(Math.abs(naive - trueEffect)).toBeGreaterThan(0.5);
  });

  it("with zero confounding, naive and IPW agree closely (sanity check)", () => {
    const prng = createPrng(99);
    const trueEffect = 2;
    const units = generateConfoundedData(prng, 20000, trueEffect, /* confound */ 0);
    const naive = estimateDifferenceInMeans(units);
    const ipw = estimateIPW(units);
    expect(Math.abs(naive - ipw)).toBeLessThan(0.3);
  });

  it("rejects propensities outside (0,1) — positivity assumption", () => {
    expect(() => estimateIPW([{ treated: true, outcome: 1, propensity: 1 }])).toThrow();
    expect(() => estimateIPW([{ treated: true, outcome: 1, propensity: 0 }])).toThrow();
  });

  it("rejects difference-in-means with no treated or no control units", () => {
    expect(() => estimateDifferenceInMeans([{ treated: true, outcome: 1, propensity: 0.5 }])).toThrow();
  });
});
