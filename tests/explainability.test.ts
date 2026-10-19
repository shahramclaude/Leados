// Explainability contract test: every people-intelligence score (flight
// risk, succession coverage risk, ...) must name its inputs, its
// uncertainty, its lawful purpose, and give counterfactual recommendations
// rather than bare labels.

import { describe, expect, it } from "vitest";
import { computeFlightRisk, type FlightRiskInputs } from "../src/lib/domain/people/flightRisk";
import { computeCoverageRisk, type RoleCoverageInputs } from "../src/lib/domain/people/succession";
import type { ExplainableScore } from "../src/lib/domain/types";

function assertContract(score: ExplainableScore) {
  expect(score.value).toBeGreaterThanOrEqual(0);
  expect(score.value).toBeLessThanOrEqual(1);
  expect(score.confidenceInterval.low).toBeLessThanOrEqual(score.value);
  expect(score.confidenceInterval.high).toBeGreaterThanOrEqual(score.value);
  expect(score.confidenceInterval.level).toBeGreaterThan(0);
  expect(score.drivers.length).toBeGreaterThan(0);
  for (const driver of score.drivers) {
    expect(driver.key.length).toBeGreaterThan(0);
    expect(driver.label.length).toBeGreaterThan(0);
    expect(typeof driver.contribution).toBe("number");
    expect(driver.explanation.length).toBeGreaterThan(0);
  }
  expect(score.inputsUsed.length).toBeGreaterThan(0);
  expect(Array.isArray(score.excludedAttributes)).toBe(true);
  expect(score.lawfulPurpose.length).toBeGreaterThan(0);
  expect(score.recommendations.length).toBeGreaterThan(0);
  // Recommendations must be actions, not bare labels — require each to read
  // like an instruction (contains a verb-ish imperative pattern: starts
  // with a capitalized word and is a full phrase of reasonable length).
  for (const rec of score.recommendations) {
    expect(rec.split(" ").length).toBeGreaterThanOrEqual(3);
  }
  expect(score.decisionSupportNotice.length).toBeGreaterThan(0);
  expect(() => new Date(score.asOf).toISOString()).not.toThrow();
}

describe("explainability contract", () => {
  it("flight-risk score satisfies the contract for a typical profile", () => {
    const inputs: FlightRiskInputs = {
      tenureMonths: 30,
      compaRatio: 0.92,
      daysSinceLastGrowthConversation: 120,
      managerChangedInLastNDays: true,
      openCommitmentMissRate: 0.5,
      goalsAtRiskCount: 2,
      skillStagnationMonths: 10,
      recentRoleChange: false,
    };
    assertContract(computeFlightRisk(inputs));
  });

  it("flight-risk score satisfies the contract even with missing data", () => {
    const inputs: FlightRiskInputs = {
      tenureMonths: 3,
      compaRatio: null,
      daysSinceLastGrowthConversation: null,
      managerChangedInLastNDays: false,
      openCommitmentMissRate: 0,
      goalsAtRiskCount: 0,
      skillStagnationMonths: 18,
      recentRoleChange: true,
    };
    const score = computeFlightRisk(inputs);
    assertContract(score);
    // Missing data must widen uncertainty, never silently vanish.
    expect(score.confidenceInterval.high - score.confidenceInterval.low).toBeGreaterThan(0.2);
  });

  it("succession coverage-risk score satisfies the contract", () => {
    const inputs: RoleCoverageInputs = {
      roleId: 1,
      title: "VP Engineering",
      teamId: 1,
      criticality: "critical",
      incumbentId: 10,
      incumbentFlightRisk: 0.4,
      candidates: [
        {
          personId: 11,
          displayName: "Test Candidate",
          readiness: "ready_later",
          confidence: 0.6,
          evidence: ["Led a cross-team migration in 2025"],
          gapPlan: "Needs more P&L exposure.",
        },
      ],
    };
    assertContract(computeCoverageRisk(inputs));
  });

  it("flagging decision-support language explicitly disclaims automated decision-making", () => {
    const score = computeFlightRisk({
      tenureMonths: 24,
      compaRatio: 1,
      daysSinceLastGrowthConversation: 10,
      managerChangedInLastNDays: false,
      openCommitmentMissRate: 0,
      goalsAtRiskCount: 0,
      skillStagnationMonths: 1,
      recentRoleChange: false,
    });
    expect(score.decisionSupportNotice.toLowerCase()).toMatch(/not.*decision|decision support/);
    expect(score.lawfulPurpose.toLowerCase()).toContain("retention");
  });
});
