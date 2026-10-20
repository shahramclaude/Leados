import { describe, expect, it } from "vitest";
import { loadSCM, simulate } from "../scm";
import { runCausalQuery } from "../query";
import { mulberry32 } from "../rng";
import type { StructuralCausalModel } from "../types";

const confounded: StructuralCausalModel = {
  id: "confounded",
  version: "1",
  label: "confounded",
  description: "",
  createdAt: new Date().toISOString(),
  variables: [
    { id: "U", label: "U", kind: "latent", domain: "continuous", description: "", observable: false },
    { id: "X", label: "X", kind: "metric", domain: "continuous", description: "", observable: true },
    { id: "Y", label: "Y", kind: "outcome", domain: "continuous", description: "", observable: true },
  ],
  assignments: [
    { variable: "U", parents: [], fn: { type: "linear", coefficients: {}, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
    { variable: "X", parents: ["U"], fn: { type: "linear", coefficients: { U: 1.3 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
    { variable: "Y", parents: ["X", "U"], fn: { type: "linear", coefficients: { X: 0.2, U: 3 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
  ],
};

const clean: StructuralCausalModel = {
  id: "clean",
  version: "1",
  label: "clean",
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
    { variable: "Y", parents: ["X", "Z"], fn: { type: "linear", coefficients: { X: 1.5, Z: 0.5 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
  ],
};

describe("identification before estimation", () => {
  it("fails loudly (non-identifiable) on a confounded synthetic case with an unmeasured confounder", () => {
    const model = loadSCM(confounded);
    const data = simulate(model, 1000, mulberry32(11));
    const estimate = runCausalQuery({
      scm: confounded,
      query: { effect: "X", on: "Y", population: "synthetic" },
      data,
      evidence: [],
    });

    expect(estimate.identifiable).toBe(false);
    expect(estimate.estimate).toBeUndefined();
    expect(estimate.associationOnly).toBeDefined();
    expect(estimate.confoundersSuspected).toContain("U");
    expect(estimate.sensitivity?.eValue).toBeGreaterThan(1);
  });

  it("identifies and estimates the clean (observed-confounder) case", () => {
    const model = loadSCM(clean);
    const data = simulate(model, 1000, mulberry32(12));
    const estimate = runCausalQuery({
      scm: clean,
      query: { effect: "X", on: "Y", population: "synthetic" },
      data,
      evidence: [],
    });

    expect(estimate.identifiable).toBe(true);
    expect(estimate.adjustmentSet).toEqual(["Z"]);
    expect(estimate.estimate).toBeDefined();
    expect(Math.abs((estimate.estimate?.ate ?? 0) - 1.5)).toBeLessThan(0.25);
  });

  it("degrades to association-only on a multi-mediator frontdoor set rather than guessing", () => {
    const multiMediator: StructuralCausalModel = {
      id: "multi-mediator",
      version: "1",
      label: "multi-mediator",
      description: "",
      createdAt: new Date().toISOString(),
      variables: [
        { id: "U", label: "U", kind: "latent", domain: "continuous", description: "", observable: false },
        { id: "X", label: "X", kind: "metric", domain: "continuous", description: "", observable: true },
        { id: "M1", label: "M1", kind: "metric", domain: "continuous", description: "", observable: true },
        { id: "M2", label: "M2", kind: "metric", domain: "continuous", description: "", observable: true },
        { id: "Y", label: "Y", kind: "outcome", domain: "continuous", description: "", observable: true },
      ],
      assignments: [
        { variable: "U", parents: [], fn: { type: "linear", coefficients: {}, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
        { variable: "X", parents: ["U"], fn: { type: "linear", coefficients: { U: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
        { variable: "M1", parents: ["X"], fn: { type: "linear", coefficients: { X: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
        { variable: "M2", parents: ["X"], fn: { type: "linear", coefficients: { X: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
        { variable: "Y", parents: ["M1", "M2", "U"], fn: { type: "linear", coefficients: { M1: 1, M2: 1, U: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
      ],
    };
    const model = loadSCM(multiMediator);
    const data = simulate(model, 400, mulberry32(14));
    const estimate = runCausalQuery({
      scm: multiMediator,
      query: { effect: "X", on: "Y", population: "synthetic" },
      data,
      evidence: [],
    });
    expect(estimate.identifiable).toBe(true);
    expect(estimate.estimate).toBeUndefined();
    expect(estimate.associationOnly).toBeDefined();
  });

  it("throws on unknown query variables", () => {
    const model = loadSCM(clean);
    const data = simulate(model, 50, mulberry32(13));
    expect(() =>
      runCausalQuery({
        scm: clean,
        query: { effect: "nope", on: "Y", population: "synthetic" },
        data,
        evidence: [],
      })
    ).toThrow();
  });
});
