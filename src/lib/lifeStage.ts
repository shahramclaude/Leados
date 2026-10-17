// life_stage — 12-dimension organizational maturity profiling.
//
// PROVENANCE: the task's pasted "pt-P" brief names a module `js/life_stage.js`
// with "12-dimension maturity profiling." No such file, nor any maturity-model
// code, was found anywhere in github.com/wbweve/Leados during this session's
// inspection (see AI-SESSION-LOG.md). This is original, from-scratch logic
// satisfying that description — not a port of verified prior code.
//
// The 12 dimensions themselves are an original synthesis for this delivery,
// not a citation of a named external maturity framework.

import { LIFE_STAGE_DIMENSIONS } from "./types";
import type { LifeStageDimension } from "./types";
import { clamp, round1 } from "./prng";

export type LifeStageName = "Seed" | "Emerging" | "Scaling" | "Established" | "Mature";

export interface LifeStageResult {
  overall: number;
  stage: LifeStageName;
  dimensions: { key: LifeStageDimension; label: string; score: number }[];
  weakestLinks: { key: LifeStageDimension; label: string; score: number }[];
  strongestAssets: { key: LifeStageDimension; label: string; score: number }[];
  balance: number; // 0-100, 100 = perfectly even maturity across dimensions
}

const STAGE_THRESHOLDS: { min: number; stage: LifeStageName }[] = [
  { min: 80, stage: "Mature" },
  { min: 65, stage: "Established" },
  { min: 50, stage: "Scaling" },
  { min: 32, stage: "Emerging" },
  { min: 0, stage: "Seed" },
];

export function stageForScore(score: number): LifeStageName {
  return STAGE_THRESHOLDS.find((t) => score >= t.min)!.stage;
}

/**
 * Standard deviation across the 12 dimension scores, inverted into a 0-100
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
  const dims = LIFE_STAGE_DIMENSIONS.map((d) => ({ ...d, score: clamp(input[d.key] ?? 0) }));
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

/** A single composite 0-100 "maturity" signal, used by compound_intel.ts. */
export function lifeStageSignal(input: Record<LifeStageDimension, number>): number {
  return computeLifeStage(input).overall;
}
