// Shared types for LeadOS pt-S — Bayesian Belief Network Engine (Part 1).
// Original to this delivery. No equivalent type file was found anywhere in
// github.com/wbweve/Leados during this session's inspection (see AI-SESSION-LOG.md).

export type HypothesisId =
  | "attrition.next60d"
  | "revenue.miss.next_quarter"
  | "crisis.next30d"
  | "okr.on_track"
  | "key_hire.success";

export type RuleId = "R1" | "R6" | "R7" | "R10" | "R14" | "R73" | "R104" | "R157";

export interface RuleDef {
  id: RuleId;
  title: string;
  description: string;
  category: string;
}

export interface Finding {
  rule: RuleId;
}

export interface LikelihoodEntry {
  likelihoodRatio: number;
  source: string;
}

export interface PriorEntry {
  description: string;
  prior: number;
  source: string;
  label: string;
}

export interface AppliedEvidence {
  evidence: string;
  likelihoodRatio: number;
  source: string;
  effect: "increases" | "decreases";
}

export interface BeliefResult {
  prior: number;
  posterior: number;
  posteriorPct: number;
  appliedEvidence: AppliedEvidence[];
  label: string;
  hasLikelihoodModel: boolean;
}

export type MoodScenario = "declining" | "stable" | "improving";

export interface ManualEvidenceState {
  "comp.at_market": boolean;
  "promotion.recent": boolean;
  "pipeline.shrinking": boolean;
  "nps.high": boolean;
  "velocity.stable": boolean;
}

export interface AppState {
  ruleFlags: Record<RuleId, boolean>;
  moodScenario: MoodScenario;
  goalHitRateMode: "synthetic" | "manual";
  goalHitRateManual: number; // 0..1
  manualEvidence: ManualEvidenceState;
  lastComputedAt: string | null;
}

export const STORAGE_KEY = "leados-pts-bayesian:v1";
