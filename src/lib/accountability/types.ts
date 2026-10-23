// LEADOS — Part 56: Algorithmic Accountability — shared types
//
// This file defines the `System` shape required by the standing order:
//   System = { id, purpose, affectedParties, inputs, outputs, decisionRole,
//              riskTier, modelCards[], monitoringCheckIds, impactAssessment,
//              humanOversight, conformityEvidence }
// split across a static "definition" (what a human author declares when a
// new engine ships) and the DB-backed "record" (what the registry actually
// stores, including derived/aggregated fields for the console).

export type AffectedParty = "workers" | "customers" | "citizens";
export type DecisionRole = "inform" | "recommend" | "automate";

/** Part 10's action tiers (stand-in). T0 = no/negligible individual impact,
 * T4 = automated action with high stakes for an individual's rights/income/safety. */
export type ActionTier = "T0" | "T1" | "T2" | "T3" | "T4";

/** Regulatory-style tiers that ActionTier is deterministically mapped to.
 * NOTE: this mapping is a LEADOS-internal convention loosely patterned after
 * risk-tiering language used in AI-governance frameworks. It is NOT a
 * certification against any named external standard. */
export type RegulatoryTier = "minimal" | "limited" | "high" | "unacceptable";

export interface HumanOversight {
  owner: string;
  method: string;
  trainingNotes: string;
}

export interface OptOutPolicy {
  allowed: boolean;
  /** Required even when allowed=false: what the person can do instead, and
   * why opt-out is restricted. Must never be left blank ("documented limits"). */
  limits: string;
}

export interface ModelCardSeed {
  name: string;
  version: string;
  summary: string;
  trainingData: string;
  limitations: string;
  metrics: Record<string, number>;
}

/** Static declaration a system author must provide — this is what the
 * registry-completeness lint checks against discovered intelligence modules. */
export interface AlgoSystemDefinition {
  id: string;
  name: string;
  purpose: string;
  affectedParties: AffectedParty;
  inputs: string[];
  outputs: string[];
  decisionRole: DecisionRole;
  actionTier: ActionTier;
  sourceModule: string;
  owner: string;
  humanOversight: HumanOversight;
  optOutPolicy: OptOutPolicy;
  modelCardSeed: ModelCardSeed;
}

export interface ExplanationFactor {
  factor: string;
  weight: number;
  direction: "increases" | "decreases";
}

export interface ConformityScope {
  frame: string;
  statement: string;
  notCertified: string[];
}
