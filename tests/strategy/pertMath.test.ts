import { describe, expect, it } from "vitest";
import fc from "./fastcheckLite";
import {
  computeCriticalPath,
  deliveryDateDistribution,
  monteCarloDeliveryDays,
  pert,
} from "@/lib/strategy/portfolioMath";
import type { MilestoneNode } from "@/lib/strategy/strategyModels";

describe("PERT expected value and variance identities", () => {
  it("t_e = (a + 4m + b) / 6 exactly", () => {
    fc.forEachTriple((a, m, b) => {
      const { te } = pert(a, m, b);
      expect(te).toBeCloseTo((a + 4 * m + b) / 6, 10);
    });
  });

  it("variance = ((b - a) / 6)^2 exactly", () => {
    fc.forEachTriple((a, m, b) => {
      const { variance } = pert(a, m, b);
      const expected = ((b - a) / 6) ** 2;
      expect(variance).toBeCloseTo(expected, 10);
    });
  });

  it("symmetric triangular (a=2,m=5,b=8) gives t_e = m", () => {
    const { te } = pert(2, 5, 8);
    expect(te).toBeCloseTo(5, 10);
  });

  it("degenerate case a=m=b gives t_e = a and variance 0", () => {
    const { te, variance } = pert(4, 4, 4);
    expect(te).toBe(4);
    expect(variance).toBe(0);
  });
});

function chain(initiativeId: string, estimates: [number, number, number][]): MilestoneNode[] {
  return estimates.map(([a, m, b], idx) => ({
    id: `${initiativeId}-m${idx}`,
    initiativeId,
    name: `m${idx}`,
    sequence: idx,
    dependsOnMilestoneId: idx === 0 ? null : `${initiativeId}-m${idx - 1}`,
    optimisticDays: a,
    mostLikelyDays: m,
    pessimisticDays: b,
    status: "planned",
  }));
}

describe("critical path: longest path through t_e", () => {
  it("sums t_e and variance along a linear chain", () => {
    const milestones = chain("init1", [
      [1, 2, 3],
      [2, 4, 6],
      [3, 6, 9],
    ]);
    const result = computeCriticalPath("init1", milestones);
    const sumTe = milestones.reduce((s, m) => s + pert(m.optimisticDays, m.mostLikelyDays, m.pessimisticDays).te, 0);
    const sumVar = milestones.reduce(
      (s, m) => s + pert(m.optimisticDays, m.mostLikelyDays, m.pessimisticDays).variance,
      0,
    );
    expect(result.totalTe).toBeCloseTo(sumTe, 10);
    expect(result.totalVariance).toBeCloseTo(sumVar, 10);
    expect(result.path).toEqual(["init1-m0", "init1-m1", "init1-m2"]);
  });

  it("picks the longer of two parallel branches forking from a shared root", () => {
    // root -> short (1 day) and root -> long (10 days), both depending
    // explicitly on root so neither falls back to sequence-based chaining.
    const root: MilestoneNode = {
      id: "root",
      initiativeId: "init2",
      name: "root",
      sequence: 0,
      dependsOnMilestoneId: null,
      optimisticDays: 2,
      mostLikelyDays: 2,
      pessimisticDays: 2,
      status: "planned",
    };
    const short: MilestoneNode = {
      id: "short",
      initiativeId: "init2",
      name: "short",
      sequence: 1,
      dependsOnMilestoneId: "root",
      optimisticDays: 1,
      mostLikelyDays: 1,
      pessimisticDays: 1,
      status: "planned",
    };
    const long: MilestoneNode = {
      id: "long",
      initiativeId: "init2",
      name: "long",
      sequence: 2,
      dependsOnMilestoneId: "root",
      optimisticDays: 10,
      mostLikelyDays: 10,
      pessimisticDays: 10,
      status: "planned",
    };
    const result = computeCriticalPath("init2", [root, short, long]);
    expect(result.path).toEqual(["root", "long"]);
    expect(result.totalTe).toBeCloseTo(12, 10); // 2 (root) + 10 (long branch)
  });

  it("falls back to sequence-order chaining when dependsOnMilestoneId is omitted (flat milestone list)", () => {
    const a: MilestoneNode = {
      id: "a",
      initiativeId: "init3",
      name: "a",
      sequence: 0,
      dependsOnMilestoneId: null,
      optimisticDays: 1,
      mostLikelyDays: 1,
      pessimisticDays: 1,
      status: "planned",
    };
    const b: MilestoneNode = {
      id: "b",
      initiativeId: "init3",
      name: "b",
      sequence: 1,
      dependsOnMilestoneId: null,
      optimisticDays: 2,
      mostLikelyDays: 2,
      pessimisticDays: 2,
      status: "planned",
    };
    const result = computeCriticalPath("init3", [a, b]);
    expect(result.path).toEqual(["a", "b"]);
    expect(result.totalTe).toBeCloseTo(3, 10);
  });
});

describe("delivery date distribution", () => {
  it("P50 equals the mean (z=0), P80 and P95 are strictly later when variance > 0", () => {
    const dist = deliveryDateDistribution("2026-01-01T00:00:00.000Z", 30, 25); // stddev = 5
    expect(new Date(dist.p50).getTime()).toBeLessThanOrEqual(new Date(dist.p80).getTime());
    expect(new Date(dist.p80).getTime()).toBeLessThanOrEqual(new Date(dist.p95).getTime());
    expect(dist.meanDays).toBe(30);
    expect(dist.stdDevDays).toBe(5);
  });

  it("collapses P50=P80=P95 when variance is 0", () => {
    const dist = deliveryDateDistribution("2026-01-01T00:00:00.000Z", 10, 0);
    expect(dist.p50).toBe(dist.p80);
    expect(dist.p80).toBe(dist.p95);
  });
});

describe("Monte Carlo delivery simulation", () => {
  it("is deterministic given the same seed and caches results", () => {
    const milestones = chain("mc1", [
      [1, 2, 3],
      [2, 4, 8],
    ]);
    const first = monteCarloDeliveryDays("mc1", milestones, 500, 1);
    const second = monteCarloDeliveryDays("mc1", milestones, 500, 1);
    expect(first).toEqual(second); // cache hit, byte-identical
  });

  it("produces P50 <= P80 <= P95", () => {
    const milestones = chain("mc2", [
      [2, 5, 14],
      [1, 3, 10],
    ]);
    const result = monteCarloDeliveryDays("mc2", milestones, 2000, 99);
    expect(result.p50Days).toBeLessThanOrEqual(result.p80Days);
    expect(result.p80Days).toBeLessThanOrEqual(result.p95Days);
  });

  it("mean is close to the analytic sum of t_e (within simulation noise)", () => {
    const milestones = chain("mc3", [
      [5, 10, 15],
      [5, 10, 15],
    ]);
    const result = monteCarloDeliveryDays("mc3", milestones, 5000, 123);
    const analyticTe = milestones.reduce((s, m) => s + pert(m.optimisticDays, m.mostLikelyDays, m.pessimisticDays).te, 0);
    expect(Math.abs(result.meanDays - analyticTe)).toBeLessThan(1); // triangular mean == PERT te for symmetric cases
  });
});
