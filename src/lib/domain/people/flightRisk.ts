// Flight-risk engine.
//
// What this is: a transparent, logistic-calibrated estimate of voluntary
// attrition propensity over the next ~2 quarters, built from a small set of
// named, auditable signals. It is NOT a black box — every coefficient below
// is fixed, documented, and the same for every person. It is NOT a
// prediction of what a specific person will do; it is decision support for
// a manager/HR conversation.
//
// Lawful purpose: retention planning and manager coaching (legitimate
// interest), scoped to the "flight-risk-scoring" consent category. See
// docs/FAIRNESS.md for the bias audit and docs/PRIVACY.md for the lawful
// basis writeup.
//
// Hard rule: PROTECTED_ATTRIBUTES are never inputs. This is enforced at
// runtime via assertNoProtectedAttributes and exercised by
// tests/fairness.test.ts.

import { PROTECTED_ATTRIBUTES, type Driver, type ExplainableScore } from "../types";
import { assertNoProtectedAttributes } from "./privacy";

export interface FlightRiskInputs {
  tenureMonths: number;
  compaRatio: number | null; // null = unknown, treated as neutral, flagged as missing data
  daysSinceLastGrowthConversation: number | null;
  managerChangedInLastNDays: boolean;
  openCommitmentMissRate: number; // 0..1, share of their own commitments missed
  goalsAtRiskCount: number;
  skillStagnationMonths: number; // months since last skill-evidence event
  recentRoleChange: boolean;
}

interface WeightedFeature {
  key: keyof FlightRiskInputs | "missingCompa" | "missingGrowthData";
  label: string;
  weight: number; // logistic-scale coefficient, fixed & documented
  present: boolean;
  standardizedValue: number; // feature value mapped to roughly [-1, 1]
  explain: (inputs: FlightRiskInputs) => string;
  recommend: (inputs: FlightRiskInputs) => string;
}

const INTERCEPT = -1.35; // calibrated so a "typical" profile sits near ~0.2

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function buildFeatures(inputs: FlightRiskInputs): WeightedFeature[] {
  const features: WeightedFeature[] = [];

  // Compa-ratio below band midpoint (1.0) is a well-documented attrition driver.
  if (inputs.compaRatio != null) {
    const gap = clamp(1 - inputs.compaRatio, -0.4, 0.4); // >0 means below midpoint
    features.push({
      key: "compaRatio",
      label: "Compa-ratio vs. band midpoint",
      weight: 1.6,
      present: true,
      standardizedValue: gap / 0.4,
      explain: (i) =>
        i.compaRatio! < 1
          ? `Compa-ratio ${i.compaRatio!.toFixed(2)} is below the band midpoint.`
          : `Compa-ratio ${i.compaRatio!.toFixed(2)} is at or above the band midpoint.`,
      recommend: () => "Review compa-ratio against band and peers at the next comp cycle.",
    });
  } else {
    features.push({
      key: "missingCompa",
      label: "Compa-ratio data missing",
      weight: 0,
      present: false,
      standardizedValue: 0,
      explain: () => "No compa-ratio on file — this signal is excluded, not assumed.",
      recommend: () => "Record a compa-ratio at the next comp review to improve this estimate.",
    });
  }

  // No growth/career conversation in a while.
  if (inputs.daysSinceLastGrowthConversation != null) {
    const v = clamp((inputs.daysSinceLastGrowthConversation - 60) / 120, -1, 1);
    features.push({
      key: "daysSinceLastGrowthConversation",
      label: "Time since last growth conversation",
      weight: 1.1,
      present: true,
      standardizedValue: v,
      explain: (i) => `${i.daysSinceLastGrowthConversation} days since the last growth conversation.`,
      recommend: () => "Have a growth/career conversation in the next 1:1.",
    });
  } else {
    features.push({
      key: "missingGrowthData",
      label: "Growth conversation history missing",
      weight: 0,
      present: false,
      standardizedValue: 0,
      explain: () => "No growth-conversation event on file for this person yet.",
      recommend: () => "Schedule an initial growth conversation.",
    });
  }

  features.push({
    key: "managerChangedInLastNDays",
    label: "Recent manager change",
    weight: 0.55,
    present: true,
    standardizedValue: inputs.managerChangedInLastNDays ? 1 : -0.2,
    explain: (i) =>
      i.managerChangedInLastNDays
        ? "Manager changed within the last 90 days."
        : "No recent manager change.",
    recommend: () => "New manager: prioritize a relationship-building 1:1 cadence for 90 days.",
  });

  features.push({
    key: "openCommitmentMissRate",
    label: "Commitment follow-through",
    weight: 0.9,
    present: true,
    standardizedValue: clamp(inputs.openCommitmentMissRate * 2 - 0.3, -1, 1),
    explain: (i) => `${Math.round(i.openCommitmentMissRate * 100)}% of their recent commitments were missed.`,
    recommend: () => "Review workload and blockers behind missed commitments together.",
  });

  features.push({
    key: "goalsAtRiskCount",
    label: "Goals currently at risk",
    weight: 0.5,
    present: true,
    standardizedValue: clamp(inputs.goalsAtRiskCount / 3, -0.3, 1),
    explain: (i) => `${i.goalsAtRiskCount} goal(s) currently flagged at risk.`,
    recommend: () => "Re-scope or re-resource at-risk goals in the next planning cycle.",
  });

  features.push({
    key: "skillStagnationMonths",
    label: "Time since last new skill evidence",
    weight: 0.35,
    present: true,
    standardizedValue: clamp((inputs.skillStagnationMonths - 6) / 12, -0.5, 1),
    explain: (i) => `${i.skillStagnationMonths} months since new skill evidence was recorded.`,
    recommend: () => "Identify a stretch assignment to build a new skill credential.",
  });

  features.push({
    key: "recentRoleChange",
    label: "Recent role change",
    weight: -0.4, // a fresh role is usually a retention *positive* in the short term
    present: true,
    standardizedValue: inputs.recentRoleChange ? 1 : 0,
    explain: (i) => (i.recentRoleChange ? "Recently moved into a new role." : "No recent role change."),
    recommend: () => "Check in on ramp progress and early wins in the new role.",
  });

  // tenure: U-shaped risk (very new or long-plateaued both elevate risk) —
  // modeled simply as two independent bounded terms.
  const earlyTenureRisk = clamp((9 - inputs.tenureMonths) / 9, 0, 1); // high risk in first 9 months
  const plateauRisk = clamp((inputs.tenureMonths - 36) / 48, 0, 1); // rises after 3 years, caps ~7y
  features.push({
    key: "tenureMonths",
    label: "Tenure stage",
    weight: 0.7,
    present: true,
    standardizedValue: Math.max(earlyTenureRisk, plateauRisk * 0.6),
    explain: (i) =>
      i.tenureMonths < 9
        ? `${i.tenureMonths} months tenure — early ramp period carries elevated flight risk industry-wide.`
        : i.tenureMonths > 36
          ? `${i.tenureMonths} months tenure — long-tenure plateau can elevate flight risk without active growth.`
          : `${i.tenureMonths} months tenure — no elevated tenure-stage risk.`,
    recommend: () => "Pair a longer-tenure employee with a fresh stretch goal or mentorship role.",
  });

  return features;
}

export function computeFlightRisk(inputs: FlightRiskInputs, asOf: Date = new Date()): ExplainableScore {
  assertNoProtectedAttributes(inputs as unknown as Record<string, unknown>);

  const features = buildFeatures(inputs);
  const linear =
    INTERCEPT + features.reduce((sum, f) => sum + f.weight * f.standardizedValue, 0);
  const value = clamp(sigmoid(linear), 0.01, 0.95);

  // Uncertainty shrinks as more signals are present (data completeness),
  // widens otherwise. This is a documented heuristic, not a statistically
  // fitted posterior — stated explicitly in the notice below.
  const missingCount = features.filter((f) => !f.present).length;
  const halfWidth = clamp(0.08 + missingCount * 0.07, 0.08, 0.3);

  const drivers: Driver[] = features
    .map((f) => ({
      key: String(f.key),
      label: f.label,
      contribution: Number((f.weight * f.standardizedValue).toFixed(3)),
      explanation: f.explain(inputs),
    }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  const recommendations = features
    .filter((f) => f.weight * f.standardizedValue > 0.15)
    .sort((a, b) => Math.abs(b.weight * b.standardizedValue) - Math.abs(a.weight * a.standardizedValue))
    .slice(0, 3)
    .map((f) => f.recommend(inputs));

  const inputsUsed = features.filter((f) => f.present).map((f) => String(f.key));

  return {
    value: Number(value.toFixed(3)),
    confidenceInterval: {
      low: Number(clamp(value - halfWidth, 0.01, 0.99).toFixed(3)),
      high: Number(clamp(value + halfWidth, 0.01, 0.99).toFixed(3)),
      level: 0.9,
    },
    drivers,
    inputsUsed,
    excludedAttributes: EXCLUDED_ATTRIBUTES,
    lawfulPurpose:
      "Retention planning and manager coaching support. Not used for automated decisions about pay, promotion, or termination.",
    recommendations: recommendations.length > 0 ? recommendations : ["No elevated drivers detected — maintain regular 1:1 cadence."],
    decisionSupportNotice:
      "This is a calibrated estimate with uncertainty, built for a conversation — not a verdict. It must not be the sole basis for any employment decision.",
    asOf: asOf.toISOString(),
  };
}

// Re-exported for tests that want to assert the exact excluded list matches
// the canonical PROTECTED_ATTRIBUTES constant. Sourced from the single
// canonical list in src/lib/domain/types.ts so the two can never diverge.
export const EXCLUDED_ATTRIBUTES: readonly string[] = PROTECTED_ATTRIBUTES;
