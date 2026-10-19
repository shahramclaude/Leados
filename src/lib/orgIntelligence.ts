import type { Domain, GraphEdge, Hypothesis, Person, RuleEvaluation } from "@/lib/types";
import { hasExitSignal } from "@/lib/eventBrain";

// ─────────────────────────────────────────────────────────────────────────
// orgIntelligence — nine-box placement, PageRank over the causal graph,
// composite entropy, hypothesis dedup, morning brief generation, Brier
// score, and overall org health scoring. Small, focused pure functions
// shared across the Cockpit and People views.
// ─────────────────────────────────────────────────────────────────────────

export type NineBoxId =
  | "risk" | "inconsistent_player" | "enigma"
  | "key_player" | "core_player" | "high_potential"
  | "trusted_professional" | "high_performer" | "star";

export interface NineBoxPlacement {
  person: Person;
  box: NineBoxId;
  performanceTier: "low" | "medium" | "high";
  potentialTier: "low" | "medium" | "high";
}

function tier(v: number): "low" | "medium" | "high" {
  if (v < 40) return "low";
  if (v <= 70) return "medium";
  return "high";
}

const BOX_MAP: Record<string, NineBoxId> = {
  "low:low": "risk",
  "low:medium": "inconsistent_player",
  "low:high": "enigma",
  "medium:low": "core_player",
  "medium:medium": "key_player",
  "medium:high": "high_potential",
  "high:low": "trusted_professional",
  "high:medium": "high_performer",
  "high:high": "star",
};

/** Places every person into exactly one of the 9 boxes — no duplicates,
 * no omissions (self-test T09_NINE_BOX_COMPLETE). */
export function computeNineBox(people: Person[]): NineBoxPlacement[] {
  return people.map((person) => {
    const performanceTier = tier(person.performance);
    const potentialTier = tier(person.potential);
    const box = BOX_MAP[`${performanceTier}:${potentialTier}`];
    return { person, box, performanceTier, potentialTier };
  });
}

/**
 * PageRank (Brin & Page, 1998) over a directed graph. DESIGN PARAMETER:
 * damping factor d=0.85, iterations=50 (converges well before that for
 * graphs of this size).
 */
export function computePageRank(nodeIds: string[], edges: GraphEdge[], damping = 0.85, iterations = 50): Map<string, number> {
  const n = nodeIds.length;
  if (n === 0) return new Map();
  const outDegree = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  for (const id of nodeIds) {
    outDegree.set(id, 0);
    incoming.set(id, []);
  }
  for (const e of edges) {
    if (!outDegree.has(e.source) || !incoming.has(e.target)) continue;
    outDegree.set(e.source, (outDegree.get(e.source) ?? 0) + 1);
    incoming.set(e.target, [...(incoming.get(e.target) ?? []), e.source]);
  }
  let ranks = new Map(nodeIds.map((id) => [id, 1 / n]));
  for (let iter = 0; iter < iterations; iter++) {
    const next = new Map<string, number>();
    for (const id of nodeIds) {
      const incomers = incoming.get(id) ?? [];
      let sum = 0;
      for (const src of incomers) {
        const deg = outDegree.get(src) || 1;
        sum += (ranks.get(src) ?? 0) / deg;
      }
      next.set(id, (1 - damping) / n + damping * sum);
    }
    ranks = next;
  }
  // Normalize to [0,1] bound (self-test T21).
  const max = Math.max(...ranks.values(), 1e-9);
  const normalized = new Map<string, number>();
  for (const [id, v] of ranks.entries()) normalized.set(id, Math.max(0, Math.min(1, v / max)));
  return normalized;
}

/** Normalized Shannon entropy of a distribution, scaled to [0, 100]. */
export function compositeEntropy(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0 || counts.length <= 1) return 0;
  const probs = counts.filter((c) => c > 0).map((c) => c / total);
  const entropy = -probs.reduce((a, p) => a + p * Math.log2(p), 0);
  const maxEntropy = Math.log2(counts.length);
  const score = maxEntropy > 0 ? (entropy / maxEntropy) * 100 : 0;
  return Math.max(0, Math.min(100, score));
}

/** Deduplicate hypotheses by (ruleId, entityId) key — keeps the most recent. */
export function dedupeHypotheses(hypotheses: Hypothesis[]): Hypothesis[] {
  const map = new Map<string, Hypothesis>();
  for (const h of hypotheses) {
    const key = `${h.ruleId}::${h.entityId ?? "org"}`;
    const existing = map.get(key);
    if (!existing || new Date(h.createdAt) > new Date(existing.createdAt)) map.set(key, h);
  }
  return [...map.values()];
}

export function computeBrierScore(predictions: { confidence: number; outcome: 0 | 1 }[]): number {
  if (predictions.length === 0) return 0;
  const sumSq = predictions.reduce((a, p) => a + (p.confidence - p.outcome) ** 2, 0);
  return Math.max(0, Math.min(1, sumSq / predictions.length));
}

/** Builds a strictly 4-sentence morning brief (exactly 3 '. ' separators). */
export function buildMorningBrief(params: {
  orgName: string;
  firingCount: number;
  criticalCount: number;
  topFinding: string | null;
  runwayMonths: number | null;
}): string {
  const s1 = `${params.orgName} currently has ${params.firingCount} active signal(s) across the organization`;
  const s2 = params.criticalCount > 0
    ? `${params.criticalCount} of those are critical severity and require same-day attention`
    : `None of those are critical severity today`;
  const s3 = params.topFinding
    ? `The highest-priority item is: ${params.topFinding}`
    : `No single finding dominates the picture right now`;
  const s4 = params.runwayMonths !== null
    ? `Median projected runway stands at ${params.runwayMonths.toFixed(1)} months`
    : `Financial telemetry is not yet connected`;
  return `${s1}. ${s2}. ${s3}. ${s4}.`;
}

export function computeOrgHealthScore(params: {
  teamHealthScore: number; // 0-100
  avgConfidence: number; // 0-1
  bankruptcyRisk: number; // 0-1
  avgFlightRisk: number; // 0-1
  firingCriticalCount: number;
}): number {
  let score = 100;
  score -= (100 - params.teamHealthScore) * 0.25;
  score -= (1 - params.avgConfidence) * 25;
  score -= params.bankruptcyRisk * 30;
  score -= params.avgFlightRisk * 20;
  score -= Math.min(20, params.firingCriticalCount * 5);
  return Math.max(0, Math.min(100, score));
}

export { hasExitSignal };
export type { RuleEvaluation, Domain };
