// life_stage — maturity-stage profiling.
//
// Originally authored (see AI-SESSION-LOG history in this codebase) as a
//12-dimension ORGANIZATIONAL maturity model (Seed/Emerging/Scaling/
// Established/Mature). src/lib/peopleIntelligence.ts reuses the exact same
// `stageForScore` threshold ladder and `balanceIndex` stdev transform here,
// applied to an INDIVIDUAL career-maturity composite (tenure, growth
// velocity, promotion recency, engagement) rather than org-wide dimensions —
// a disclosed adaptation, not a re-citation of a different external model.
// The 12-dimension organizational profile (computeLifeStage) is kept
// unchanged and still available for org-level maturity reporting.

import { clamp, round1 } from "./mathUtils";

export type LifeStageName = "Seed" | "Emerging" | "Scaling" | "Established" | "Mature";

export const LIFE_STAGE_DIMENSIONS = [
  "leadership",
  "strategy",
  "governance",
  "financeOps",
  "talentOps",
  "productOps",
  "salesOps",
  "customerOps",
  "dataOps",
  "riskOps",
  "culture",
  "brand",
] as const;

export type LifeStageDimension = (typeof LIFE_STAGE_DIMENSIONS)[number];

export interface LifeStageResult {
  overall: number;
  stage: LifeStageName;
  dimensions: { key: LifeStageDimension; score: number }[];
  weakestLinks: { key: LifeStageDimension; score: number }[];
  strongestAssets: { key: LifeStageDimension; score: number }[];
  balance: number; // 0-100, 100 = perfectly even maturity across dimensions
}

const STAGE_THRESHOLDS: { min: number; stage: LifeStageName }[] = [
  { min: 80, stage: "Mature" },
  { min: 65, stage: "Established" },
  { min: 50, stage: "Scaling" },
  { min: 32, stage: "Emerging" },
  { min: 0, stage: "Seed" },
];

/** Shared threshold ladder — used both for org-level maturity (computeLifeStage
 *  below) and, by peopleIntelligence.ts, for an individual career-maturity tag. */
export function stageForScore(score: number): LifeStageName {
  return STAGE_THRESHOLDS.find((t) => score >= t.min)!.stage;
}

/**
 * Standard deviation across the dimension scores, inverted into a 0-100
 * "balance" index. Disclosed convention: this is a readability transform
 * (100 - stdev*k, clamped), not a validated organizational-science metric.
 */
function balanceIndex(scores: number[]): number {
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  const stdev = Math.sqrt(variance);
  return clamp(100 - stdev * 2.4);
}

export function computeLifeStage(input: Record<LifeStageDimension, number>): LifeStageResult {
  const dims = LIFE_STAGE_DIMENSIONS.map((key) => ({ key, score: clamp(input[key] ?? 0) }));
  const scores = dims.map((d) => d.score);
  const overall = round1(scores.reduce((a, b) => a + b, 0) / scores.length);
  const sorted = [...dims].sort((a, b) => a.score - b.score);

  return {
    overall,
    stage: stageForScore(overall),
    dimensions: dims,
    weakestLinks: sorted.slice(0, 3),
    strongestAssets: sorted.slice(-3).reverse(),
    balance: round1(balanceIndex(scores)),
  };
}

/** A single composite 0-100 "maturity" signal, used by compound_intel-style callers. */
export function lifeStageSignal(input: Record<LifeStageDimension, number>): number {
  return computeLifeStage(input).overall;
}

/**
 * Individual career-life-stage composite — OWN DERIVATION for
 * peopleIntelligence.ts. Blends tenure depth (capped at 5y = 100),
 * growth velocity, and time-since-last-promotion recency into one 0-100
 * score, then maps it through the SAME stageForScore ladder used for org
 * maturity above (Seed..Mature here reads as "new joiner" .. "veteran /
 * plateaued", surfaced to the UI as the lifeStageTag).
 */
export function individualCareerMaturity(
  tenureDays: number | null,
  growthVelocity: number,
  monthsSincePromotion: number
): { score: number; stage: LifeStageName } {
  const tenureComponent = clamp(((tenureDays ?? 0) / (365 * 5)) * 100) * 0.4;
  const growthComponent = clamp(growthVelocity) * 0.35;
  const promotionRecencyComponent = clamp(100 - monthsSincePromotion * 2) * 0.25;
  const score = round1(tenureComponent + growthComponent + promotionRecencyComponent);
  return { score, stage: stageForScore(score) };
}
