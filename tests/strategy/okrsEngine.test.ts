import { describe, expect, it } from "vitest";
import { computeKeyResultProgress, computeObjectiveScore } from "@/lib/strategy/okrsEngine";
import { healthBandFor } from "@/lib/strategy/strategyModels";
import type { EvidenceRefInput, KeyResultInput } from "@/lib/strategy/strategyModels";

function kr(partial: Partial<KeyResultInput> & { id: string }): KeyResultInput {
  return {
    objectiveId: "obj1",
    title: partial.id,
    baseline: 0,
    target: 100,
    current: 0,
    unit: "",
    direction: "up",
    progressMode: "linear",
    weight: 1,
    stretch: false,
    confidenceClass: null,
    milestonesTotal: null,
    milestonesComplete: null,
    thresholdValue: null,
    ...partial,
  };
}

describe("progress derivation: evidence beats assertion", () => {
  it("uses evidence when present, ignoring the hand-typed current value", () => {
    const k = kr({ id: "k1", current: 10 }); // asserted says 10%
    const evidence: EvidenceRefInput[] = [
      { id: "e1", keyResultId: "k1", sourceType: "metric_series", sourceId: "m1", value: 60, observedAt: new Date().toISOString(), note: null },
    ];
    const result = computeKeyResultProgress(k, evidence);
    expect(result.source).toBe("evidence");
    expect(result.progress).toBeCloseTo(0.6, 10);
    expect(result.confidenceWeight).toBe(1.0);
  });

  it("falls back to assertion with declared confidence when no evidence exists", () => {
    const k = kr({ id: "k1", current: 30, confidenceClass: "medium" });
    const result = computeKeyResultProgress(k, []);
    expect(result.source).toBe("asserted");
    expect(result.progress).toBeCloseTo(0.3, 10);
    expect(result.confidenceClass).toBe("medium");
    expect(result.confidenceWeight).toBe(0.5);
  });

  it("defaults undeclared confidence to 'low'", () => {
    const k = kr({ id: "k1", current: 30, confidenceClass: null });
    const result = computeKeyResultProgress(k, []);
    expect(result.confidenceClass).toBe("low");
    expect(result.confidenceWeight).toBe(0.25);
  });

  it("picks the most recent evidence ref by observedAt", () => {
    const k = kr({ id: "k1" });
    const evidence: EvidenceRefInput[] = [
      { id: "old", keyResultId: "k1", sourceType: "manual", sourceId: null, value: 10, observedAt: "2026-01-01T00:00:00.000Z", note: null },
      { id: "new", keyResultId: "k1", sourceType: "manual", sourceId: null, value: 90, observedAt: "2026-02-01T00:00:00.000Z", note: null },
    ];
    const result = computeKeyResultProgress(k, evidence);
    expect(result.latestEvidenceId).toBe("new");
    expect(result.progress).toBeCloseTo(0.9, 10);
  });

  it("handles direction=down correctly", () => {
    const k = kr({ id: "k1", baseline: 100, target: 20, direction: "down" });
    const evidence: EvidenceRefInput[] = [
      { id: "e1", keyResultId: "k1", sourceType: "manual", sourceId: null, value: 60, observedAt: new Date().toISOString(), note: null },
    ];
    const result = computeKeyResultProgress(k, evidence);
    // (100 - 60) / (100 - 20) = 0.5
    expect(result.progress).toBeCloseTo(0.5, 10);
  });

  it("clips progress to [0, 1] even when evidence overshoots", () => {
    const k = kr({ id: "k1" });
    const evidence: EvidenceRefInput[] = [
      { id: "e1", keyResultId: "k1", sourceType: "manual", sourceId: null, value: 150, observedAt: new Date().toISOString(), note: null },
    ];
    const result = computeKeyResultProgress(k, evidence);
    expect(result.progress).toBe(1);
    expect(result.rawRatio).toBeCloseTo(1.5, 10); // raw ratio preserved for drift magnitude
  });
});

describe("objective scoring", () => {
  it("weights KRs proportionally and normalizes to [0,1]", () => {
    const krs = [
      kr({ id: "k1", weight: 3, current: 100 }), // full credit
      kr({ id: "k2", weight: 1, current: 0 }), // zero credit
    ];
    const score = computeObjectiveScore("obj1", false, krs, []);
    // weighted: (3/4)*1*confidenceWeight(low=0.25) + (1/4)*0 = 0.1875
    expect(score.score).toBeCloseTo(0.75 * 0.25, 5);
  });

  it("evidence-backed KRs score higher than identical-progress asserted KRs due to confidence weighting", () => {
    const assertedKr = kr({ id: "k1", current: 50, confidenceClass: "low" });
    const evidenceKr = kr({ id: "k2", current: 50 });
    const evidence: EvidenceRefInput[] = [
      { id: "e1", keyResultId: "k2", sourceType: "manual", sourceId: null, value: 50, observedAt: new Date().toISOString(), note: null },
    ];
    const assertedScore = computeObjectiveScore("obj1", false, [assertedKr], []);
    const evidenceScore = computeObjectiveScore("obj1", false, [evidenceKr], evidence);
    expect(evidenceScore.score).toBeGreaterThan(assertedScore.score);
  });
});

describe("stretch calibration policy", () => {
  it("committed objective needs >=0.9 to be healthy", () => {
    expect(healthBandFor(0.95, false)).toBe("healthy");
    expect(healthBandFor(0.85, false)).toBe("at_risk");
    expect(healthBandFor(0.5, false)).toBe("off_track");
  });

  it("stretch objective is healthy at 0.7", () => {
    expect(healthBandFor(0.7, true)).toBe("healthy");
    expect(healthBandFor(0.69, true)).toBe("at_risk");
    expect(healthBandFor(0.3, true)).toBe("off_track");
  });

  it("the same raw score can be healthy for stretch but at_risk for committed", () => {
    expect(healthBandFor(0.75, true)).toBe("healthy");
    expect(healthBandFor(0.75, false)).toBe("at_risk");
  });
});
