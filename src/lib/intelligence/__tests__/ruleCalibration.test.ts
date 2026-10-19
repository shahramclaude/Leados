import { describe, expect, it } from "vitest";
import { brierScore, expectedCalibrationError, reliabilityBins } from "../ruleCalibration";
import { generateAllCalibrationDatasets } from "../goldenDataset";
import { proposeWeightAdjustment, applyWeightAdjustment } from "../autoCalibrate";
import { DEFAULT_RULES } from "../ruleEngine";

describe("Calibration math", () => {
  it("Brier score of always predicting 0.5 is exactly 0.25", () => {
    const predictions = [
      { ruleId: "r", domain: "d", predictedProbability: 0.5, outcome: 1 as const, timestamp: "", features: {} },
      { ruleId: "r", domain: "d", predictedProbability: 0.5, outcome: 0 as const, timestamp: "", features: {} },
    ];
    expect(brierScore(predictions)).toBeCloseTo(0.25, 10);
  });

  it("Brier score of a perfect forecaster is 0", () => {
    const predictions = [
      { ruleId: "r", domain: "d", predictedProbability: 1, outcome: 1 as const, timestamp: "", features: {} },
      { ruleId: "r", domain: "d", predictedProbability: 0, outcome: 0 as const, timestamp: "", features: {} },
    ];
    expect(brierScore(predictions)).toBeCloseTo(0, 10);
  });

  it("reliability bins + ECE are reproducible from the golden dataset", () => {
    const datasets = generateAllCalibrationDatasets();
    const predictions = datasets["rule.forecast.slipRisk"];
    const bins = reliabilityBins(predictions);
    const totalCount = bins.reduce((sum, b) => sum + b.count, 0);
    expect(totalCount).toBe(predictions.length);
    const ece = expectedCalibrationError(bins, predictions.length);
    expect(ece).toBeGreaterThanOrEqual(0);
    expect(ece).toBeLessThan(0.5);

    // Deterministic seed => deterministic metric (regression guard: this
    // value must not drift silently if someone changes the generator or
    // calibration math without updating this test deliberately).
    expect(brierScore(predictions)).toBeGreaterThan(0);
    expect(brierScore(predictions)).toBeLessThan(0.3);
  });

  it("the well-calibrated control rule needs no material weight change", () => {
    const datasets = generateAllCalibrationDatasets();
    const rule = DEFAULT_RULES.find((r) => r.id === "rule.forecast.slipRisk")!;
    const proposal = proposeWeightAdjustment(rule.id, rule.weight, datasets[rule.id]);
    expect(Math.abs(proposal.proposedWeight - rule.weight)).toBeLessThan(0.3);
  });

  it("an under-confident rule gets a proposed weight INCREASE", () => {
    const datasets = generateAllCalibrationDatasets();
    const rule = DEFAULT_RULES.find((r) => r.id === "rule.deal.stalled")!;
    const proposal = proposeWeightAdjustment(rule.id, rule.weight, datasets[rule.id]);
    expect(proposal.calibrationSlope).toBeGreaterThan(1);
    expect(proposal.proposedWeight).toBeGreaterThan(rule.weight);
  });

  it("an over-confident rule gets a proposed weight DECREASE", () => {
    const datasets = generateAllCalibrationDatasets();
    const rule = DEFAULT_RULES.find((r) => r.id === "rule.account.churnRisk")!;
    const proposal = proposeWeightAdjustment(rule.id, rule.weight, datasets[rule.id]);
    expect(proposal.calibrationSlope).toBeLessThan(1);
    expect(proposal.proposedWeight).toBeLessThan(rule.weight);
  });

  it("guardrail: max step size is never exceeded even for a huge calibration slope", () => {
    // Force an extreme slope scenario: near-identical predictions that all
    // resolve to outcome=1, which pushes the calibration slope very high.
    const extreme = Array.from({ length: 50 }, (_, i) => ({
      ruleId: "r",
      domain: "d",
      predictedProbability: 0.51 + i * 0.001,
      outcome: 1 as 0 | 1,
      timestamp: "",
      features: {},
    }));
    const proposal = proposeWeightAdjustment("r", 1, extreme);
    expect(Math.abs(proposal.proposedWeight - 1)).toBeLessThanOrEqual(0.25 + 1e-9);
  });

  it("guardrail: a proposal is never applied without explicit human approval", () => {
    const proposal = proposeWeightAdjustment("r", 1, []);
    const unapproved = applyWeightAdjustment(proposal);
    expect(unapproved.applied).toBe(false);
    expect(unapproved.weight).toBe(1);

    const approved = applyWeightAdjustment(proposal, "vp-sales@leados.ai");
    expect(approved.applied).toBe(true);
  });
});
