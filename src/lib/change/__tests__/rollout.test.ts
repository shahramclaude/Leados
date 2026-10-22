import { describe, it, expect } from "vitest";
import { assignSteppedWedge, assignTwoArm, isExposed } from "../rollout";

describe("assignSteppedWedge", () => {
  const groups = ["g1", "g2", "g3", "g4", "g5", "g6"];

  it("is deterministic for the same seed key", () => {
    const a = assignSteppedWedge(groups, 6, "seed-key-1");
    const b = assignSteppedWedge(groups, 6, "seed-key-1");
    expect(a.crossoverPeriodByGroup).toEqual(b.crossoverPeriodByGroup);
  });

  it("produces a different assignment for a different seed key (not guaranteed, but checked for this fixture)", () => {
    const a = assignSteppedWedge(groups, 6, "seed-key-1");
    const b = assignSteppedWedge(groups, 6, "seed-key-2");
    expect(a.crossoverPeriodByGroup).not.toEqual(b.crossoverPeriodByGroup);
  });

  it("assigns every group exactly one crossover period within bounds", () => {
    const periods = 6;
    const design = assignSteppedWedge(groups, periods, "seed-x");
    for (const g of groups) {
      const period = design.crossoverPeriodByGroup[g];
      expect(period).toBeGreaterThanOrEqual(0);
      expect(period).toBeLessThanOrEqual(periods - 2);
    }
    expect(Object.keys(design.crossoverPeriodByGroup).sort()).toEqual([...groups].sort());
  });

  it("rejects fewer than 2 periods", () => {
    expect(() => assignSteppedWedge(groups, 1, "seed")).toThrow();
  });
});

describe("assignTwoArm", () => {
  it("partitions all groups into treatment or control with no overlap", () => {
    const groups = Array.from({ length: 10 }, (_, i) => `g${i}`);
    const design = assignTwoArm(groups, "seed-two-arm");
    const combined = [...design.treatmentGroups, ...design.controlGroups].sort();
    expect(combined).toEqual([...groups].sort());
    const overlap = design.treatmentGroups.filter((g) => design.controlGroups.includes(g));
    expect(overlap).toHaveLength(0);
  });
});

describe("isExposed", () => {
  it("marks a group exposed only from its crossover period onward in a stepped-wedge design", () => {
    const design = assignSteppedWedge(["g1", "g2"], 4, "seed-exposure");
    const crossover = design.crossoverPeriodByGroup["g1"];
    expect(isExposed(design, "g1", crossover)).toBe(true);
    expect(isExposed(design, "g1", crossover + 1)).toBe(true);
    if (crossover > 0) {
      expect(isExposed(design, "g1", crossover - 1)).toBe(false);
    }
  });
});
