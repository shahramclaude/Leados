import { describe, expect, it } from "vitest";
import { BeliefFabric, CONTRADICTION_Z_THRESHOLD } from "../beliefFabric";
import { betaMean } from "../bayesian";

describe("BeliefFabric Bayesian updating", () => {
  it("starts at the uninformative Beta(1,1) prior (mean 0.5)", () => {
    const fabric = new BeliefFabric();
    const belief = fabric.getOrCreate("b1", "test subject", "test");
    expect(betaMean(belief.params)).toBeCloseTo(0.5, 6);
  });

  it("updates the posterior exactly per Beta-Bernoulli conjugacy", () => {
    const fabric = new BeliefFabric();
    fabric.observe("b1", "subject", "domain", {
      source: "s1",
      evidence: { type: "event", id: "e1", label: "e1", timestamp: new Date().toISOString() },
      successWeight: 4,
      failureWeight: 1,
    });
    const belief = fabric.get("b1")!;
    // Beta(1,1) + (successWeight=4, failureWeight=1) => Beta(5,2)
    expect(belief.params.alpha).toBeCloseTo(5, 6);
    expect(belief.params.beta).toBeCloseTo(2, 6);
    expect(betaMean(belief.params)).toBeCloseTo(5 / 7, 6);
  });

  it("does NOT average contradictory evidence; it flags contradiction and still applies full conjugate update", () => {
    const fabric = new BeliefFabric();
    // Build strong confidence that the outcome is TRUE.
    for (let i = 0; i < 10; i++) {
      fabric.observe("b1", "subject", "domain", {
        source: `agree-${i}`,
        evidence: { type: "event", id: `e${i}`, label: `e${i}`, timestamp: new Date().toISOString() },
        successWeight: 3,
        failureWeight: 0,
      });
    }
    const beforeContradiction = fabric.get("b1")!;
    const meanBefore = betaMean(beforeContradiction.params);
    expect(meanBefore).toBeGreaterThan(0.9);

    // Now a contradicting source says FALSE strongly.
    const afterContradiction = fabric.observe("b1", "subject", "domain", {
      source: "disagreeing-source",
      evidence: { type: "event", id: "e-contra", label: "e-contra", timestamp: new Date().toISOString() },
      successWeight: 0,
      failureWeight: 5,
    });

    const lastEntry = afterContradiction.provenance[afterContradiction.provenance.length - 1];
    expect(lastEntry.wasContradiction).toBe(true);
    expect(lastEntry.contradictionZ).toBeGreaterThan(CONTRADICTION_Z_THRESHOLD);

    // Posterior still reflects conjugate math (NOT a naive average of 0.9ish and 0).
    const expectedAlpha = beforeContradiction.params.alpha; // + 0 success weight
    const expectedBeta = beforeContradiction.params.beta + 5;
    expect(afterContradiction.params.alpha).toBeCloseTo(expectedAlpha, 6);
    expect(afterContradiction.params.beta).toBeCloseTo(expectedBeta, 6);

    // Confidence must be explicitly reduced relative to a world with no contradiction.
    expect(afterContradiction.confidence).toBeLessThan(beforeContradiction.confidence);
    expect(afterContradiction.contradictionCount).toBe(1);
  });

  it("confidence increases monotonically with consistent agreeing evidence", () => {
    const fabric = new BeliefFabric();
    let last = fabric.getOrCreate("b1", "s", "d").confidence;
    for (let i = 0; i < 20; i++) {
      const updated = fabric.observe("b1", "s", "d", {
        source: `s${i}`,
        evidence: { type: "metric", id: `m${i}`, label: `m${i}`, timestamp: new Date().toISOString() },
        successWeight: 2,
        failureWeight: 0.1,
      });
      expect(updated.confidence).toBeGreaterThanOrEqual(last);
      last = updated.confidence;
    }
  });
});
