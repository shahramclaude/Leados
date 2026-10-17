// competitive_intel — competitive intelligence aggregator.
//
// PROVENANCE: pasted "pt-O" brief names `js/competitive_intel.js`. Not found
// in github.com/wbweve/Leados this session. Original aggregation logic over
// synthetic, disclosed-fabricated competitor signals (no real company data
// is used or implied).

import type { Competitor } from "./types";
import { round1 } from "./prng";

export interface CompetitorThreat extends Competitor {
  threatScore: number;
  trend: "rising" | "stable" | "cooling";
}

export interface CompetitiveIntelResult {
  ranked: CompetitorThreat[];
  topThreat: CompetitorThreat;
  marketHeat: number; // 0-100, aggregate aggression across all competitors
}

// Original, disclosed weighting: pricing + hiring + product velocity drive
// threat; positive public sentiment modestly amplifies it.
export function threatScore(c: Competitor): number {
  const base = c.pricingAggression * 0.3 + c.hiringVelocity * 0.3 + c.productVelocity * 0.3;
  const sentimentAdj = (c.sentiment / 100) * 10;
  return Math.max(0, Math.min(100, base + sentimentAdj));
}

function trendFor(c: Competitor): CompetitorThreat["trend"] {
  const momentum = c.hiringVelocity + c.productVelocity;
  if (momentum >= 140) return "rising";
  if (momentum <= 70) return "cooling";
  return "stable";
}

export function computeCompetitiveIntel(competitors: Competitor[]): CompetitiveIntelResult {
  const ranked: CompetitorThreat[] = competitors
    .map((c) => ({ ...c, threatScore: round1(threatScore(c)), trend: trendFor(c) }))
    .sort((a, b) => b.threatScore - a.threatScore);

  const marketHeat = round1(
    competitors.reduce((s, c) => s + c.pricingAggression + c.hiringVelocity + c.productVelocity, 0) /
      (competitors.length * 3 || 1)
  );

  return { ranked, topThreat: ranked[0], marketHeat };
}

export function competitiveIntelSignal(competitors: Competitor[]): number {
  // Invert: high external threat = low "competitive position" signal.
  const { marketHeat } = computeCompetitiveIntel(competitors);
  return Math.max(0, Math.min(100, 100 - marketHeat));
}
