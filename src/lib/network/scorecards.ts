// LEADOS Part 31 — partner scorecards.
// Every score ships with an evidence class (Part 27 convention): when a score
// is derived from several inputs of differing trust, the overall evidence class
// is the *weakest* contributing class — we never let one strong input launder
// a weak one into looking fully verified.

import type { EcosystemGraph, EvidenceClass, ShareInput } from "./types";
import { herfindahlHirschmanIndex } from "./metrics";

const TRUST_ORDER: EvidenceClass[] = [
  "inferred",
  "self_reported",
  "verified_secondary",
  "verified_primary",
];

export function weakestEvidenceClass(classes: EvidenceClass[]): EvidenceClass {
  if (classes.length === 0) return "inferred";
  return classes.reduce((weakest, c) =>
    TRUST_ORDER.indexOf(c) < TRUST_ORDER.indexOf(weakest) ? c : weakest,
  );
}

export interface PartnerScorecardInput {
  partnerNodeId: string;
  graph: EcosystemGraph;
  spendShares: ShareInput[]; // all partner spend shares for the period (for concentration)
  deliveryQuality?: number; // 0..100, optional external input
  deliveryEvidenceClass?: EvidenceClass;
  linkedRiskSeverities: ("low" | "medium" | "high" | "critical")[];
}

export interface PartnerScorecard {
  partnerNodeId: string;
  deliveryQuality: number | null;
  concentrationScore: number;
  substitutabilityScore: number;
  riskScore: number;
  evidenceClass: EvidenceClass;
  notes: string;
}

const SEVERITY_WEIGHT: Record<string, number> = { low: 10, medium: 30, high: 60, critical: 90 };

export function computePartnerScorecard(input: PartnerScorecardInput): PartnerScorecard {
  const { partnerNodeId, graph, spendShares, deliveryQuality, deliveryEvidenceClass, linkedRiskSeverities } =
    input;

  const hhi = herfindahlHirschmanIndex(spendShares);
  const partnerShare = hhi.shares.find((s) => s.key === partnerNodeId)?.share ?? 0;

  const partnerEdges = graph.edges.filter(
    (e) => e.source === partnerNodeId || e.target === partnerNodeId,
  );
  const avgSubstitutability =
    partnerEdges.length > 0
      ? partnerEdges.reduce((acc, e) => acc + e.substitutability, 0) / partnerEdges.length
      : 0.5;

  const riskFromSeverities =
    linkedRiskSeverities.length > 0
      ? linkedRiskSeverities.reduce((acc, s) => acc + (SEVERITY_WEIGHT[s] ?? 0), 0) /
        linkedRiskSeverities.length
      : 0;

  // Risk score blends: concentration (high share = risk), substitutability
  // (low substitutability = risk), and linked register severities.
  const riskScore = clamp(
    0.4 * (partnerShare * 100) + 0.3 * ((1 - avgSubstitutability) * 100) + 0.3 * riskFromSeverities,
    0,
    100,
  );

  const evidenceInputs: EvidenceClass[] = [
    ...partnerEdges.map((e) => e.evidenceClass),
    deliveryEvidenceClass ?? "inferred",
  ];

  const evidenceClass = weakestEvidenceClass(evidenceInputs);

  const notes = [
    `spend share ${(partnerShare * 100).toFixed(1)}%`,
    `avg substitutability ${(avgSubstitutability * 100).toFixed(0)}%`,
    linkedRiskSeverities.length > 0
      ? `${linkedRiskSeverities.length} linked risk(s)`
      : "no linked risks",
  ].join("; ");

  return {
    partnerNodeId,
    deliveryQuality: deliveryQuality ?? null,
    concentrationScore: round(partnerShare),
    substitutabilityScore: round(avgSubstitutability),
    riskScore: round(riskScore),
    evidenceClass,
    notes,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
