import { describe, expect, it } from "vitest";
import { backdoorAdjustmentSet, buildGraph, CyclicGraphError, loadModel, frontdoorAdjustment } from "../dag";
import type { StructuralCausalModel } from "../types";

function scm(overrides: Partial<StructuralCausalModel> = {}): StructuralCausalModel {
  return {
    id: "test",
    version: "1",
    label: "test",
    description: "",
    createdAt: new Date().toISOString(),
    variables: [],
    assignments: [],
    ...overrides,
  };
}

describe("acyclicity validation", () => {
  it("throws a named-cycle error for a cyclic model", () => {
    const model = scm({
      variables: [
        { id: "a", label: "a", kind: "metric", domain: "continuous", description: "", observable: true },
        { id: "b", label: "b", kind: "metric", domain: "continuous", description: "", observable: true },
        { id: "c", label: "c", kind: "metric", domain: "continuous", description: "", observable: true },
      ],
      assignments: [
        { variable: "b", parents: ["a"], fn: { type: "linear", coefficients: { a: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
        { variable: "c", parents: ["b"], fn: { type: "linear", coefficients: { b: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
        { variable: "a", parents: ["c"], fn: { type: "linear", coefficients: { c: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
      ],
    });

    expect(() => loadModel(model)).toThrow(CyclicGraphError);
    try {
      loadModel(model);
    } catch (err) {
      expect(err).toBeInstanceOf(CyclicGraphError);
      expect((err as Error).message).toContain("->");
      expect((err as CyclicGraphError).cycle.length).toBeGreaterThan(1);
    }
  });

  it("accepts a valid DAG", () => {
    const model = scm({
      variables: [
        { id: "a", label: "a", kind: "metric", domain: "continuous", description: "", observable: true },
        { id: "b", label: "b", kind: "metric", domain: "continuous", description: "", observable: true },
      ],
      assignments: [
        { variable: "b", parents: ["a"], fn: { type: "linear", coefficients: { a: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
      ],
    });
    expect(() => loadModel(model)).not.toThrow();
  });
});

describe("backdoor adjustment", () => {
  it("finds {Z} for the canonical fork Z -> X, Z -> Y, X -> Y", () => {
    const model = scm({
      variables: [
        { id: "Z", label: "Z", kind: "metric", domain: "continuous", description: "", observable: true },
        { id: "X", label: "X", kind: "metric", domain: "continuous", description: "", observable: true },
        { id: "Y", label: "Y", kind: "outcome", domain: "continuous", description: "", observable: true },
      ],
      assignments: [
        { variable: "X", parents: ["Z"], fn: { type: "linear", coefficients: { Z: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
        { variable: "Y", parents: ["X", "Z"], fn: { type: "linear", coefficients: { X: 1, Z: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
      ],
    });
    const graph = buildGraph(model);
    const result = backdoorAdjustmentSet(graph, "X", "Y");
    expect(result.satisfied).toBe(true);
    expect(result.adjustmentSet).toEqual(["Z"]);
  });

  it("fails loudly when the only blocking variable is latent", () => {
    const model = scm({
      variables: [
        { id: "U", label: "U", kind: "latent", domain: "continuous", description: "", observable: false },
        { id: "X", label: "X", kind: "metric", domain: "continuous", description: "", observable: true },
        { id: "Y", label: "Y", kind: "outcome", domain: "continuous", description: "", observable: true },
      ],
      assignments: [
        { variable: "X", parents: ["U"], fn: { type: "linear", coefficients: { U: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
        { variable: "Y", parents: ["X", "U"], fn: { type: "linear", coefficients: { X: 1, U: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
      ],
    });
    const graph = buildGraph(model);
    const result = backdoorAdjustmentSet(graph, "X", "Y");
    expect(result.satisfied).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});

describe("frontdoor adjustment", () => {
  it("finds mediator M when X has no direct edge to Y", () => {
    const model = scm({
      variables: [
        { id: "U", label: "U", kind: "latent", domain: "continuous", description: "", observable: false },
        { id: "X", label: "X", kind: "metric", domain: "continuous", description: "", observable: true },
        { id: "M", label: "M", kind: "metric", domain: "continuous", description: "", observable: true },
        { id: "Y", label: "Y", kind: "outcome", domain: "continuous", description: "", observable: true },
      ],
      assignments: [
        { variable: "X", parents: ["U"], fn: { type: "linear", coefficients: { U: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
        { variable: "M", parents: ["X"], fn: { type: "linear", coefficients: { X: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
        { variable: "Y", parents: ["M", "U"], fn: { type: "linear", coefficients: { M: 1, U: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
      ],
    });
    const graph = buildGraph(model);
    const result = frontdoorAdjustment(graph, "X", "Y");
    expect(result.satisfied).toBe(true);
    expect(result.mediators).toEqual(["M"]);
  });
});
