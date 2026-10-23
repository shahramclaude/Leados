import { describe, expect, it } from "vitest";
import {
  bucketize,
  computeConvergence,
  evaluateStoppingRule,
  summarizeRound,
  type DelphiEstimateInput,
} from "../delphi";

function round(estimates: number[], rationales: string[] = []): DelphiEstimateInput[] {
  return estimates.map((estimate, i) => ({
    forecasterId: `f${i}`,
    anonymousTag: `Anon-${i}`,
    estimate,
    rationale: rationales[i] ?? `reasoning ${i}`,
  }));
}

describe("Delphi round summarization", () => {
  it("buckets estimates into 10 deciles covering [0,1]", () => {
    const buckets = bucketize([0.05, 0.15, 0.95, 0.5]);
    expect(buckets).toHaveLength(10);
    expect(buckets.reduce((a, b) => a + b.count, 0)).toBe(4);
  });

  it("flags dissenters without deleting them from the record", () => {
    const estimates = round([0.5, 0.52, 0.48, 0.95], ["a", "b", "c", "strong outlier reasoning"]);
    const summary = summarizeRound(1, estimates, 0.2);
    expect(summary.dissenters).toHaveLength(1);
    expect(summary.dissenters[0].rationale).toBe("strong outlier reasoning");
    // Dissent must still be present in the underlying estimate count.
    expect(summary.n).toBe(4);
  });

  it("samples de-duplicated anonymized rationales for controlled feedback", () => {
    const estimates = round([0.4, 0.4, 0.6], ["same reasoning", "same reasoning", "different reasoning"]);
    const summary = summarizeRound(1, estimates);
    expect(summary.rationaleSample).toEqual(["same reasoning", "different reasoning"]);
  });
});

describe("convergence + stopping rules", () => {
  it("computes shrinking stdDev across rounds as a panel converges", () => {
    const roundsOfEstimates = [
      round([0.2, 0.4, 0.6, 0.8]),
      round([0.35, 0.45, 0.55, 0.65]),
      round([0.45, 0.48, 0.52, 0.55]),
    ];
    const convergence = computeConvergence(roundsOfEstimates);
    expect(convergence).toHaveLength(3);
    expect(convergence[0].stdDevDelta).toBeNull();
    expect(convergence[1].stdDevDelta).toBeLessThan(0);
    expect(convergence[2].stdDevDelta).toBeLessThan(0);
    expect(convergence[2].stdDev).toBeLessThan(convergence[0].stdDev);
  });

  it("stops once stdDev falls below the converged threshold", () => {
    const convergence = computeConvergence([round([0.5, 0.51, 0.49, 0.5])]);
    const decision = evaluateStoppingRule(convergence, { convergedStdDev: 0.05 });
    expect(decision.stop).toBe(true);
    expect(decision.reason).toMatch(/converged/);
  });

  it("stops at the round cap even if still converging", () => {
    const convergence = computeConvergence([
      round([0.1, 0.9]),
      round([0.2, 0.8]),
      round([0.3, 0.7]),
    ]);
    const decision = evaluateStoppingRule(convergence, { maxRounds: 3, convergedStdDev: 0.01, minStdDevImprovement: 0.001 });
    expect(decision.stop).toBe(true);
    expect(decision.reason).toMatch(/max rounds/);
  });

  it("does NOT stop because of dissent — dissent is never treated as a stop trigger", () => {
    const roundsOfEstimates = [round([0.3, 0.32, 0.31, 0.95])]; // one strong dissenter, low overall stdDev would stop for other reasons
    const convergence = computeConvergence(roundsOfEstimates);
    expect(convergence[0].dissentCount).toBeGreaterThan(0);
    // stopping rule function never reads dissentCount as an input signal
    const decision = evaluateStoppingRule(convergence, { convergedStdDev: 0.0001, maxRounds: 50, minStdDevImprovement: 0.0001 });
    // With high stdDev due to the dissenter it should NOT claim convergence-based stop.
    expect(decision.stop).toBe(false);
  });

  it("continues when improvement is still above the minimum threshold", () => {
    // Round 1 stdDev ~0.566, round 2 stdDev ~0.424 => |delta| ~0.142, well above a 0.05 floor.
    const convergence = computeConvergence([round([0.1, 0.9]), round([0.2, 0.8])]);
    const decision = evaluateStoppingRule(convergence, { minStdDevImprovement: 0.05, convergedStdDev: 0.001, maxRounds: 20 });
    expect(decision.stop).toBe(false);
  });
});
