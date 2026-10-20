import { describe, expect, it } from "vitest";
import { loadSCM, simulate } from "../scm";
import {
  associationOnly,
  doublyRobustEstimate,
  eValueFromRiskRatio,
  MINIMUM_N,
  regressionAdjustmentEstimate,
} from "../estimation";
import { mulberry32 } from "../rng";
import { runCausalQuery } from "../query";
import type { StructuralCausalModel } from "../types";

const scm: StructuralCausalModel = {
  id: "est-test",
  version: "1",
  label: "est-test",
  description: "",
  createdAt: new Date().toISOString(),
  variables: [
    { id: "Z", label: "Z", kind: "metric", domain: "continuous", description: "", observable: true },
    { id: "X", label: "X", kind: "metric", domain: "continuous", description: "", observable: true },
    { id: "Y", label: "Y", kind: "outcome", domain: "continuous", description: "", observable: true },
  ],
  assignments: [
    { variable: "Z", parents: [], fn: { type: "linear", coefficients: {}, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
    { variable: "X", parents: ["Z"], fn: { type: "linear", coefficients: { Z: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
    { variable: "Y", parents: ["X", "Z"], fn: { type: "linear", coefficients: { X: 2.5, Z: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
  ],
};

// Binary-treatment SCM: IPW / AIPW model a binary treatment's propensity
// score, so the doubly-robust estimator is validated against a scenario
// with an actual 0/1 treatment rather than a continuous one.
const binaryTreatmentScm: StructuralCausalModel = {
  id: "est-test-binary",
  version: "1",
  label: "est-test-binary",
  description: "",
  createdAt: new Date().toISOString(),
  variables: [
    { id: "Z", label: "Z", kind: "metric", domain: "continuous", description: "", observable: true },
    { id: "X", label: "X", kind: "metric", domain: "binary", description: "", observable: true },
    { id: "Y", label: "Y", kind: "outcome", domain: "continuous", description: "", observable: true },
  ],
  assignments: [
    { variable: "Z", parents: [], fn: { type: "linear", coefficients: {}, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
    { variable: "X", parents: ["Z"], fn: { type: "logistic", coefficients: { Z: 0.8 }, intercept: 0 }, noise: { type: "bernoulli", p: 0.5 } },
    { variable: "Y", parents: ["X", "Z"], fn: { type: "linear", coefficients: { X: 2.5, Z: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
  ],
};

describe("regression adjustment", () => {
  it("recovers the true coefficient on X in a linear SCM", () => {
    const model = loadSCM(scm);
    const data = simulate(model, 2000, mulberry32(21));
    const fit = regressionAdjustmentEstimate(data, "X", "Y", ["Z"]);
    expect(Math.abs(fit.ate - 2.5)).toBeLessThan(0.15);
  });
});

describe("doubly-robust (cross-fitted) estimate", () => {
  it("recovers the true ATE within bounds on n >= minimum for a binary treatment", () => {
    const model = loadSCM(binaryTreatmentScm);
    const data = simulate(model, MINIMUM_N["doubly-robust"] + 500, mulberry32(22));
    const fit = doublyRobustEstimate(data, "X", "Y", ["Z"], { crossFit: true });
    expect(fit.crossFitted).toBe(true);
    expect(Math.abs(fit.ate - 2.5)).toBeLessThan(0.5);
  });
});

describe("minimum-N degradation", () => {
  it("degrades to association-only below the regression minimum even if identifiable", () => {
    const model = loadSCM(scm);
    const data = simulate(model, 10, mulberry32(23));
    const estimate = runCausalQuery({
      scm,
      query: { effect: "X", on: "Y", population: "synthetic" },
      data,
      evidence: [],
    });
    expect(estimate.identifiable).toBe(true); // identifiable in principle
    expect(estimate.estimate).toBeUndefined(); // but too little data to estimate
    expect(estimate.associationOnly).toBeDefined();
  });
});

describe("association-only summary", () => {
  it("computes a Pearson r with a Fisher-z confidence interval", () => {
    const model = loadSCM(scm);
    const data = simulate(model, 500, mulberry32(24));
    const assoc = associationOnly(data, "X", "Y");
    expect(assoc.r).toBeGreaterThan(0.5);
    expect(assoc.ci[0]).toBeLessThan(assoc.r);
    expect(assoc.ci[1]).toBeGreaterThan(assoc.r);
  });
});

describe("E-value sensitivity", () => {
  it("matches the known closed-form E-value for a risk ratio of 2", () => {
    // E-value for RR=2 is 2 + sqrt(2*1) = 3.414...
    expect(eValueFromRiskRatio(2)).toBeCloseTo(2 + Math.sqrt(2), 5);
  });

  it("returns 1 for a null risk ratio", () => {
    expect(eValueFromRiskRatio(1)).toBe(1);
  });
});
