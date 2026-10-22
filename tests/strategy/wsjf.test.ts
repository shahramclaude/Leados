import { describe, expect, it } from "vitest";
import { computeWSJF, costOfDelayCurve, rankInitiatives, selectPortfolio } from "@/lib/strategy/initiativesEngine";
import type { InitiativeNode } from "@/lib/strategy/strategyModels";

function initiative(partial: Partial<InitiativeNode> & { id: string }): InitiativeNode {
  return {
    objectiveId: "obj1",
    teamId: null,
    title: partial.id,
    status: "planned",
    blockerNote: null,
    budgetAllocated: 1000,
    budgetSpent: 0,
    timeCriticality: 5,
    riskReduction: 5,
    userValue: 5,
    jobSize: 5,
    requiredSkill: null,
    requiredHoursPerWeek: 10,
    startDate: null,
    targetEndDate: null,
    ...partial,
  };
}

describe("WSJF computation", () => {
  it("matches the formula exactly", () => {
    const i = initiative({ id: "i1", timeCriticality: 8, riskReduction: 6, userValue: 4, jobSize: 3 });
    const r = computeWSJF(i);
    expect(r.wsjf).toBeCloseTo((8 + 6 + 4) / 3, 10);
  });

  it("guards against division by zero job size", () => {
    const i = initiative({ id: "i1", jobSize: 0, timeCriticality: 5, riskReduction: 5, userValue: 5 });
    const r = computeWSJF(i);
    expect(Number.isFinite(r.wsjf)).toBe(true);
  });
});

describe("cost of delay curve", () => {
  it("accrues linearly per week", () => {
    const i = initiative({ id: "i1", timeCriticality: 3, riskReduction: 3, userValue: 4 });
    const curve = costOfDelayCurve(i, 4);
    expect(curve).toEqual([10, 20, 30, 40]);
  });
});

describe("WSJF ranking: deterministic and anchor-consistent", () => {
  it("ranks higher WSJF first", () => {
    const low = initiative({ id: "low", timeCriticality: 1, riskReduction: 1, userValue: 1, jobSize: 5 });
    const high = initiative({ id: "high", timeCriticality: 9, riskReduction: 9, userValue: 9, jobSize: 1 });
    const ranked = rankInitiatives([low, high]);
    expect(ranked.map((r) => r.initiativeId)).toEqual(["high", "low"]);
  });

  it("tie-break 1: equal WSJF resolved by smaller jobSize", () => {
    // Both have wsjf = 15/3 = 5 and 10/2 = 5
    const a = initiative({ id: "a", timeCriticality: 5, riskReduction: 5, userValue: 5, jobSize: 3 });
    const b = initiative({ id: "b", timeCriticality: 4, riskReduction: 3, userValue: 3, jobSize: 2 });
    const ranked = rankInitiatives([a, b]);
    expect(ranked[0].initiativeId).toBe("b"); // smaller jobSize wins the tie
  });

  it("tie-break 2: equal WSJF and jobSize resolved by higher timeCriticality", () => {
    const a = initiative({ id: "a", timeCriticality: 8, riskReduction: 1, userValue: 1, jobSize: 2 });
    const b = initiative({ id: "b", timeCriticality: 2, riskReduction: 4, userValue: 4, jobSize: 2 });
    // both wsjf = 10/2 = 5
    const ranked = rankInitiatives([a, b]);
    expect(ranked[0].initiativeId).toBe("a");
  });

  it("tie-break 3: fully tied resolved by initiative id ascending", () => {
    const b = initiative({ id: "b", timeCriticality: 5, riskReduction: 5, userValue: 5, jobSize: 3 });
    const a = initiative({ id: "a", timeCriticality: 5, riskReduction: 5, userValue: 5, jobSize: 3 });
    const ranked = rankInitiatives([b, a]);
    expect(ranked.map((r) => r.initiativeId)).toEqual(["a", "b"]);
  });

  it("is a pure function: same input always produces same order", () => {
    const items = [
      initiative({ id: "x", timeCriticality: 7, riskReduction: 2, userValue: 3, jobSize: 4 }),
      initiative({ id: "y", timeCriticality: 3, riskReduction: 9, userValue: 1, jobSize: 2 }),
      initiative({ id: "z", timeCriticality: 1, riskReduction: 1, userValue: 1, jobSize: 1 }),
    ];
    const first = rankInitiatives(items).map((r) => r.initiativeId);
    const second = rankInitiatives(items).map((r) => r.initiativeId);
    expect(first).toEqual(second);
  });
});

describe("portfolio budget constraint solver (greedy knapsack)", () => {
  it("selects highest-WSJF initiatives first within budget", () => {
    const items = [
      initiative({ id: "cheap-high-value", timeCriticality: 9, riskReduction: 9, userValue: 9, jobSize: 1, budgetAllocated: 100 }),
      initiative({ id: "expensive-low-value", timeCriticality: 1, riskReduction: 1, userValue: 1, jobSize: 9, budgetAllocated: 900 }),
      initiative({ id: "mid", timeCriticality: 5, riskReduction: 5, userValue: 5, jobSize: 5, budgetAllocated: 50 }),
    ];
    const selection = selectPortfolio(items, 150);
    expect(selection.selected.map((i) => i.id)).toContain("cheap-high-value");
    expect(selection.selected.map((i) => i.id)).toContain("mid");
    expect(selection.selected.map((i) => i.id)).not.toContain("expensive-low-value");
    expect(selection.totalBudgetUsed).toBe(150);
  });

  it("defers everything when budget is zero", () => {
    const items = [initiative({ id: "a", budgetAllocated: 10 })];
    const selection = selectPortfolio(items, 0);
    expect(selection.selected).toHaveLength(0);
    expect(selection.deferred).toHaveLength(1);
  });
});
