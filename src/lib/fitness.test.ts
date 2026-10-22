import { describe, expect, it } from "vitest";
import { computeFitnessScore } from "./fitness";

describe("seam 1: fitness reads every domain's metrics", () => {
  it("returns 0 for a domain with no metrics (no silent fabrication)", () => {
    const result = computeFitnessScore([]);
    expect(result.score).toBe(0);
    expect(result.metricCount).toBe(0);
  });

  it("averages attainment ratios across all supplied metrics", () => {
    const result = computeFitnessScore([
      { name: "revenue", value: 90, target: 100 },
      { name: "churn", value: 5, target: 10 },
    ]);
    // (0.9 + 0.5) / 2 = 0.7 -> 70
    expect(result.score).toBe(70);
    expect(result.metricCount).toBe(2);
  });

  it("clamps an outlier over-performing metric so it cannot buy a perfect score alone", () => {
    const result = computeFitnessScore([
      { name: "outlier", value: 1000, target: 10 },
      { name: "laggard", value: 0, target: 10 },
    ]);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.inputs[0].attainment).toBeLessThanOrEqual(1.5);
  });

  it("treats a zero target as zero attainment rather than throwing or returning Infinity", () => {
    const result = computeFitnessScore([{ name: "undefined-target", value: 5, target: 0 }]);
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBe(0);
  });
});
