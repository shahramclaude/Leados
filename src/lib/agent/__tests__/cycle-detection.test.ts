import { describe, expect, it } from "vitest";
import { validatePlanGraph } from "../validate";
import type { PlanGraph } from "../types";

function basePlan(): PlanGraph {
  return {
    id: "plan-test",
    objective: "Test objective for cycle detection",
    budgetUsd: 1,
    budgetMin: 10,
    createdBy: "planner-v1",
    createdAt: new Date(0).toISOString(),
    seed: "seed-1",
    promptHash: "hash-1",
    root: [
      {
        id: "a",
        kind: "act",
        goal: "A",
        tool: "metrics.read",
        inputSchema: "metrics.read.input.v1",
        input: {},
        estCostUsd: 0.01,
        estMin: 1,
        riskTier: 0,
        dependsOn: ["b"],
        successCriteria: [{ id: "c1", description: "x", check: "automatic" }],
      },
      {
        id: "b",
        kind: "act",
        goal: "B",
        tool: "metrics.read",
        inputSchema: "metrics.read.input.v1",
        input: {},
        estCostUsd: 0.01,
        estMin: 1,
        riskTier: 0,
        dependsOn: ["a"],
        successCriteria: [{ id: "c2", description: "x", check: "automatic" }],
      },
    ],
  };
}

describe("validatePlanGraph — Kahn's algorithm cycle detection", () => {
  it("rejects a plan whose dependsOn edges form a cycle", () => {
    const result = validatePlanGraph(basePlan());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("cycle"))).toBe(true);
  });

  it("accepts a plan whose dependsOn edges form a DAG", () => {
    const plan = basePlan();
    plan.root[1].dependsOn = []; // break the cycle: a depends on b, b depends on nothing
    const result = validatePlanGraph(plan);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a plan referencing an unknown dependency", () => {
    const plan = basePlan();
    plan.root[0].dependsOn = ["does-not-exist"];
    plan.root[1].dependsOn = [];
    const result = validatePlanGraph(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("unknown node"))).toBe(true);
  });

  it("rejects a plan whose estimated cost exceeds its own budget", () => {
    const plan = basePlan();
    plan.root[1].dependsOn = [];
    plan.budgetUsd = 0.001;
    const result = validatePlanGraph(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("budget"))).toBe(true);
  });

  it("rejects a plan that fails zod schema validation", () => {
    const badPlan = { ...basePlan(), root: [] };
    const result = validatePlanGraph(badPlan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith("schema:"))).toBe(true);
  });
});
