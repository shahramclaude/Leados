/**
 * Part 51 — core types for the intervention marketplace / recommender.
 */

export type EvidenceClass = "anecdotal" | "correlational" | "experimental" | "causal_replicated";

export const EVIDENCE_CLASS_RANK: Record<EvidenceClass, number> = {
  anecdotal: 0,
  correlational: 1,
  experimental: 2,
  causal_replicated: 3,
};

export type Reversibility = "easy" | "moderate" | "hard";
export type Effort = "low" | "medium" | "high";

/** Generic "explained value" wrapper used across the product (Part 30/05 style). */
export interface Explain<T> {
  value: T;
  interval: [number, number];
  evidenceClass: EvidenceClass;
  sampleSize: number;
  assumptions: string[];
  lastUpdated: string; // ISO timestamp
}

/** Canonical org/team context. Free-form string tags, kept small and explicit. */
export type Context = Record<string, string>;

export interface PreconditionRule {
  key: string;
  in?: string[];
  notIn?: string[];
}

export interface Intervention {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  play: { playbookId: string; source: "playbook_library" | "generated" };
  applicableContexts: Record<string, string[]>[];
  preconditions: PreconditionRule[];
  cost: { unit: "hours" | "dollars" | "effort_points"; amount: number };
  reversibility: Reversibility;
  effort: Effort;
  evidenceClass: EvidenceClass;
}

/** The explainability contract — every rendered recommendation must have all five. */
export interface ExplainabilityCard {
  whyNow: string;
  expectedEffect: string;
  whatItCosts: string;
  whatWeDontKnow: string;
  howToVerify: string;
}

export interface ScoreBreakdown {
  expectedUtility: number;
  contextFit: number;
  freshness: number;
  diversityPenalty: number;
  final: number;
}

export interface RankedRecommendation {
  recommendationId?: string;
  intervention: Intervention;
  effect: Explain<number>; // probability of a positive measured outcome, in this context
  contextKey: string;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  isSerendipity: boolean;
  explainability: ExplainabilityCard;
}

export type ActionDeskResult =
  | { status: "ok"; recommendations: RankedRecommendation[] }
  | { status: "no_confident_recommendation"; reason: string; dataCompleteness: number };
