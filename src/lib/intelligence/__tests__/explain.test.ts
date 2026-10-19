import { describe, expect, it } from "vitest";
import { explainBelief, explainFinding } from "../explain";
import { isValidExplanation } from "../types";
import { BeliefFabric } from "../beliefFabric";
import { scoreModel } from "../predictiveScoring";
import { runScenario } from "../scenarioEngine";
import { generateFindings } from "../intelligence";
import { sampleAccounts, INTERRUPT_OPT_IN } from "../demoData";

describe("Explainability contract", () => {
  it("explainFinding() rejects a hand-built object missing required fields", () => {
    expect(() =>
      // @ts-expect-error intentionally missing fields to prove the guard works
      explainFinding({ label: "bad", value: 1 }),
    ).toThrow();
  });

  it("every belief-derived explanation satisfies the contract", () => {
    const fabric = new BeliefFabric();
    fabric.observe("b1", "subject", "domain", {
      source: "s1",
      evidence: { type: "event", id: "e1", label: "e1", timestamp: new Date().toISOString() },
      successWeight: 3,
      failureWeight: 1,
    });
    const explanation = explainBelief(fabric.get("b1")!, "Test belief");
    expect(isValidExplanation(explanation)).toBe(true);
  });

  it("every predictive-scoring explanation satisfies the contract", () => {
    const explanation = scoreModel({
      id: "lead-1",
      label: "Lead score",
      intercept: -1,
      features: [
        { name: "engagementScore", value: 0.8, weight: 0.9 },
        { name: "firmographicFit", value: 0.6, weight: 0.7 },
      ],
    });
    expect(isValidExplanation(explanation)).toBe(true);
  });

  it("every scenario explanation satisfies the contract", () => {
    const scenario = runScenario({
      name: "test scenario",
      interventions: [{ type: "hire", amount: 2 }],
      trials: 200,
    });
    expect(isValidExplanation(scenario.explanation)).toBe(true);
  });

  it("every fused finding's explanation satisfies the contract (full pipeline)", () => {
    const findings = generateFindings(sampleAccounts(), INTERRUPT_OPT_IN);
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(isValidExplanation(finding.explanation)).toBe(true);
    }
  });
});
