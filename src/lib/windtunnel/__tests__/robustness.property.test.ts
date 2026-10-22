import { describe, expect, it } from "vitest";
import { maxRegret, regretForCell, robustnessScore, utility, validateWeights, type UtilityCell } from "../robustness";
import type { ScenarioWeight } from "../types";

function makeCells(): UtilityCell[] {
  return [
    { strategyId: "A", scenarioId: "s1", utility: 1.0 },
    { strategyId: "A", scenarioId: "s2", utility: 0.4 },
    { strategyId: "A", scenarioId: "s3", utility: 0.8 },
    { strategyId: "B", scenarioId: "s1", utility: 0.6 },
    { strategyId: "B", scenarioId: "s2", utility: 0.9 },
    { strategyId: "B", scenarioId: "s3", utility: 0.7 },
    { strategyId: "C", scenarioId: "s1", utility: 0.3 },
    { strategyId: "C", scenarioId: "s2", utility: 0.2 },
    { strategyId: "C", scenarioId: "s3", utility: 0.9 },
  ];
}

const EVEN_WEIGHTS: ScenarioWeight[] = [
  { scenarioId: "s1", weight: 1 / 3 },
  { scenarioId: "s2", weight: 1 / 3 },
  { scenarioId: "s3", weight: 1 / 3 },
];

describe("weight validation", () => {
  it("accepts weights that sum to 1", () => {
    expect(validateWeights(EVEN_WEIGHTS).valid).toBe(true);
  });

  it("rejects weights that do not sum to 1", () => {
    const bad: ScenarioWeight[] = [{ scenarioId: "s1", weight: 0.5 }, { scenarioId: "s2", weight: 0.3 }];
    const result = validateWeights(bad);
    expect(result.valid).toBe(false);
  });

  it("rejects negative weights", () => {
    const bad: ScenarioWeight[] = [{ scenarioId: "s1", weight: -0.2 }, { scenarioId: "s2", weight: 1.2 }];
    expect(validateWeights(bad).valid).toBe(false);
  });

  it("property: for 50 random non-negative weight vectors normalized to sum 1, validateWeights reports valid", () => {
    for (let trial = 0; trial < 50; trial++) {
      const raw = [Math.random(), Math.random(), Math.random()];
      const sum = raw.reduce((a, b) => a + b, 0) || 1;
      const normalized = raw.map((r) => r / sum);
      const weights: ScenarioWeight[] = normalized.map((w, i) => ({ scenarioId: `s${i + 1}`, weight: w }));
      expect(validateWeights(weights).valid).toBe(true);
    }
  });
});

describe("robustness score", () => {
  it("computes the weighted-average utility across scenarios", () => {
    const cells = makeCells();
    const r = robustnessScore("A", cells, EVEN_WEIGHTS);
    expect(r).toBeCloseTo((1.0 + 0.4 + 0.8) / 3, 10);
  });

  it("throws if weights do not sum to 1", () => {
    const cells = makeCells();
    expect(() => robustnessScore("A", cells, [{ scenarioId: "s1", weight: 0.5 }])).toThrow();
  });
});

describe("regret", () => {
  it("is always >= 0 for every cell in a random matrix (property test)", () => {
    for (let trial = 0; trial < 100; trial++) {
      const strategies = ["A", "B", "C", "D"];
      const scenarios = ["s1", "s2", "s3", "s4", "s5"];
      const cells: UtilityCell[] = [];
      for (const s of strategies) {
        for (const sc of scenarios) {
          cells.push({ strategyId: s, scenarioId: sc, utility: Math.random() * 10 - 5 });
        }
      }
      for (const cell of cells) {
        expect(regretForCell(cell, cells)).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it("is exactly 0 for the best performer in a scenario", () => {
    const cells = makeCells();
    expect(regretForCell({ strategyId: "A", scenarioId: "s1", utility: 1.0 }, cells)).toBeCloseTo(0, 10);
  });

  it("maxRegret picks the scenario where the strategy underperforms the most", () => {
    const cells = makeCells();
    const result = maxRegret("C", cells);
    // C: s1 regret = 1.0-0.3=0.7, s2 regret=0.9-0.2=0.7, s3 regret=0 (C wins s3)
    expect(result.regret).toBeCloseTo(0.7, 10);
    expect(["s1", "s2"]).toContain(result.worstScenarioId);
  });
});

describe("utility monotonicity", () => {
  it("increasing revenueGrowth never decreases utility, holding other metrics fixed", () => {
    const base = { revenueGrowth: 0.1, cashRunwayMonths: 12, churnRate: 0.08, marketShare: 0.05 };
    const higher = { ...base, revenueGrowth: 0.2 };
    expect(utility(higher)).toBeGreaterThanOrEqual(utility(base));
  });

  it("increasing cashRunwayMonths never decreases utility", () => {
    const base = { revenueGrowth: 0.1, cashRunwayMonths: 12, churnRate: 0.08, marketShare: 0.05 };
    const higher = { ...base, cashRunwayMonths: 18 };
    expect(utility(higher)).toBeGreaterThanOrEqual(utility(base));
  });

  it("decreasing churnRate never decreases utility", () => {
    const base = { revenueGrowth: 0.1, cashRunwayMonths: 12, churnRate: 0.08, marketShare: 0.05 };
    const lowerChurn = { ...base, churnRate: 0.02 };
    expect(utility(lowerChurn)).toBeGreaterThanOrEqual(utility(base));
  });

  it("increasing marketShare never decreases utility", () => {
    const base = { revenueGrowth: 0.1, cashRunwayMonths: 12, churnRate: 0.08, marketShare: 0.05 };
    const higher = { ...base, marketShare: 0.15 };
    expect(utility(higher)).toBeGreaterThanOrEqual(utility(base));
  });

  it("property: monotonicity holds across 100 random base/delta pairs", () => {
    for (let trial = 0; trial < 100; trial++) {
      const base = {
        revenueGrowth: Math.random() * 0.4 - 0.1,
        cashRunwayMonths: Math.random() * 24,
        churnRate: Math.random(),
        marketShare: Math.random(),
      };
      const metric = ["revenueGrowth", "cashRunwayMonths", "marketShare"][Math.floor(Math.random() * 3)];
      const improved = { ...base, [metric]: base[metric as keyof typeof base] + Math.random() * 0.1 };
      expect(utility(improved)).toBeGreaterThanOrEqual(utility(base) - 1e-9);
    }
  });
});
