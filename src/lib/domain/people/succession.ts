// Succession & bench-strength engine.
//
// Produces a ready-now/ready-later/develop matrix per key role plus a
// coverage-risk score. Everything here is decision support: the UI must
// render the `decisionSupportNotice` on every board, and candidate
// visibility always links back to the evidence that justified the
// readiness tier (never a bare label).

import type { ExplainableScore, Readiness, SuccessionCandidate, SuccessionRoleBoard } from "../types";

export interface SuccessionCandidateInput {
  personId: number;
  displayName: string;
  readiness: Readiness;
  confidence: number; // 0..1, how confident the evidence is
  evidence: string[];
  gapPlan: string | null;
}

export interface RoleCoverageInputs {
  roleId: number;
  title: string;
  teamId: number | null;
  criticality: "low" | "medium" | "high" | "critical";
  incumbentId: number | null;
  incumbentFlightRisk: number | null; // 0..1 or null if unknown/unscored
  candidates: SuccessionCandidateInput[];
}

const CRITICALITY_WEIGHT: Record<RoleCoverageInputs["criticality"], number> = {
  low: 0.4,
  medium: 0.7,
  high: 1,
  critical: 1.3,
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function computeCoverageRisk(inputs: RoleCoverageInputs, asOf: Date = new Date()): ExplainableScore {
  const readyNow = inputs.candidates.filter((c) => c.readiness === "ready_now");
  const readyLater = inputs.candidates.filter((c) => c.readiness === "ready_later");

  const benchDepthTerm = clamp(1 - readyNow.length * 0.4 - readyLater.length * 0.15, 0, 1);
  const incumbentRiskTerm = inputs.incumbentFlightRisk ?? 0.3; // neutral prior if unscored
  const criticalityMult = CRITICALITY_WEIGHT[inputs.criticality];

  const raw = clamp((benchDepthTerm * 0.65 + incumbentRiskTerm * 0.35) * criticalityMult, 0, 1);

  const inputsUsed = ["readyNowCount", "readyLaterCount", "criticality"];
  if (inputs.incumbentFlightRisk != null) inputsUsed.push("incumbentFlightRisk");

  const drivers = [
    {
      key: "benchDepth",
      label: "Bench depth (ready-now + ready-later candidates)",
      contribution: Number((benchDepthTerm * 0.65).toFixed(3)),
      explanation: `${readyNow.length} ready-now, ${readyLater.length} ready-later candidate(s) identified.`,
    },
    {
      key: "incumbentFlightRisk",
      label: "Incumbent flight-risk",
      contribution: Number((incumbentRiskTerm * 0.35).toFixed(3)),
      explanation:
        inputs.incumbentFlightRisk != null
          ? `Incumbent flight-risk estimate is ${(inputs.incumbentFlightRisk * 100).toFixed(0)}%.`
          : "Incumbent has no flight-risk estimate on file; a neutral prior was used.",
    },
    {
      key: "criticality",
      label: "Role criticality",
      contribution: Number(((criticalityMult - 1) * 0.2).toFixed(3)),
      explanation: `Role is tagged "${inputs.criticality}" criticality.`,
    },
  ];

  const recommendations: string[] = [];
  if (readyNow.length === 0) recommendations.push("Identify or accelerate at least one ready-now candidate.");
  if (readyLater.length === 0 && readyNow.length < 2) recommendations.push("Build a ready-later pipeline via stretch assignments.");
  if (incumbentRiskTerm > 0.4) recommendations.push("Prioritize a retention conversation with the incumbent.");
  if (recommendations.length === 0) recommendations.push("Coverage looks healthy — revisit at the next talent review.");

  return {
    value: Number(raw.toFixed(3)),
    confidenceInterval: {
      low: Number(clamp(raw - 0.12, 0, 1).toFixed(3)),
      high: Number(clamp(raw + 0.12, 0, 1).toFixed(3)),
      level: 0.9,
    },
    drivers,
    inputsUsed,
    excludedAttributes: [],
    lawfulPurpose: "Workforce planning and business continuity for key roles.",
    recommendations,
    decisionSupportNotice:
      "Succession readiness is decision support, not a decision: a ready-now tag is a planning hypothesis with named evidence, not a promotion commitment.",
    asOf: asOf.toISOString(),
  };
}

export function buildRoleBoard(inputs: RoleCoverageInputs, asOf: Date = new Date()): SuccessionRoleBoard {
  const toCandidate = (c: SuccessionCandidateInput): SuccessionCandidate => ({
    personId: c.personId,
    displayName: c.displayName,
    readiness: c.readiness,
    confidence: c.confidence,
    evidence: c.evidence,
    gapPlan: c.gapPlan,
  });

  return {
    roleId: inputs.roleId,
    title: inputs.title,
    teamId: inputs.teamId,
    criticality: inputs.criticality,
    incumbentId: inputs.incumbentId,
    coverageRisk: computeCoverageRisk(inputs, asOf),
    readyNow: inputs.candidates.filter((c) => c.readiness === "ready_now").map(toCandidate),
    readyLater: inputs.candidates.filter((c) => c.readiness === "ready_later").map(toCandidate),
    develop: inputs.candidates.filter((c) => c.readiness === "develop").map(toCandidate),
  };
}
