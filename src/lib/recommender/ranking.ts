/**
 * Part 51 — Ranking engine (Phase 1 "Ranking" + Phase 3b).
 *
 * score = expectedUtility(effect, cost, risk) x contextFit x freshness
 *
 * Diversity: hard cap of `maxPerCategory` items per category in the final
 * list, enforced inside an MMR-style (maximal marginal relevance) selection
 * loop: at each step we pick the candidate maximizing
 *   lambda * normalizedRelevance - (1 - lambda) * maxSimilarityToSelected
 * among candidates that haven't hit their category cap yet. Similarity here
 * is category-identity (1 if same category as an already-selected item, else
 * 0) — a simplified MMR redundancy signal appropriate for a short, card-based
 * list. This is documented, not hidden, per the standing order.
 *
 * Serendipity: one reserved slot (when `allowSerendipity` is true) goes to
 * the highest-expected-utility candidate that is *outside* the org's usual
 * profile (contextFit below `SERENDIPITY_FIT_CEILING`) but carries strong,
 * verified evidence (evidenceClass >= experimental, sampleSize >= 5). If no
 * such candidate exists, the slot is left empty — we do not pad with noise.
 *
 * Honesty rule: if no candidate clears the confidence bar, the function
 * returns an explicit `no_confident_recommendation` result instead of a
 * padded list.
 */

import { randomUUID } from "crypto";
import { db } from "@/db";
import { recRecommendations } from "@/db/schema";
import { contextFit } from "@/lib/fitness";
import { canonicalizeContext } from "@/lib/router/context";
import { ensureInterventionsSeeded, listInterventions } from "./registry";
import { decayedView, getOrInitContextEffect } from "./beliefUpdate";
import { buildExplainabilityCard, lintExplainabilityCard } from "./explainability";
import { EVIDENCE_CLASS_RANK } from "./types";
import type {
  ActionDeskResult,
  Context,
  Intervention,
  RankedRecommendation,
  ScoreBreakdown,
} from "./types";

const REVERSIBILITY_RISK: Record<Intervention["reversibility"], number> = {
  easy: 0.1,
  moderate: 0.4,
  hard: 0.8,
};
const EFFORT_RISK: Record<Intervention["effort"], number> = {
  low: 0.1,
  medium: 0.4,
  high: 0.8,
};
const COST_REFERENCE_HOURS = 8; // 1 day of effort treated as the normalization reference

const SERENDIPITY_FIT_CEILING = 0.3;
const MIN_CONFIDENT_SCORE = 0.05;
const MIN_CONFIDENT_SAMPLE_SIZE = 5;

interface Candidate {
  intervention: Intervention;
  fit: number;
  matchedContexts: number;
  effectValue: number;
  effectInterval: [number, number];
  evidenceClass: RankedRecommendation["effect"]["evidenceClass"];
  sampleSize: number;
  assumptions: string[];
  lastUpdated: string;
  expectedUtility: number;
  freshness: number;
  score: number;
}

function expectedUtility(intervention: Intervention, effectValue: number): number {
  const normalizedEffect = (effectValue - 0.5) * 2; // -1..1
  const normalizedCost =
    intervention.cost.unit === "hours"
      ? Math.min(1, intervention.cost.amount / (COST_REFERENCE_HOURS * 4))
      : Math.min(1, intervention.cost.amount / 2000);
  const riskScore = (REVERSIBILITY_RISK[intervention.reversibility] + EFFORT_RISK[intervention.effort]) / 2;
  const COST_WEIGHT = 0.3;
  const RISK_WEIGHT = 0.3;
  return normalizedEffect - normalizedCost * COST_WEIGHT - riskScore * RISK_WEIGHT;
}

async function buildCandidates(interventions: Intervention[], context: Context): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const contextKey = canonicalizeContext(context);

  for (const intervention of interventions) {
    const fitResult = contextFit(intervention, context);
    if (fitResult.hardFail) continue;

    const row = await getOrInitContextEffect(intervention.id, contextKey, intervention.evidenceClass);
    const { effect, daysSinceUpdate } = decayedView(row);

    const freshness =
      row.sourceType === "prior" ? 0.4 : 0.3 + 0.7 * Math.pow(0.5, daysSinceUpdate / row.halfLifeDays);

    const utility = expectedUtility(intervention, effect.value);
    const score = utility * fitResult.fit * freshness;

    out.push({
      intervention,
      fit: fitResult.fit,
      matchedContexts: fitResult.matchedContexts,
      effectValue: effect.value,
      effectInterval: effect.interval,
      evidenceClass: effect.evidenceClass,
      sampleSize: effect.sampleSize,
      assumptions: effect.assumptions,
      lastUpdated: effect.lastUpdated,
      expectedUtility: utility,
      freshness,
      score,
    });
  }
  return out;
}

/** Hard cap + MMR-style diversity re-ranking, documented above the module. */
function mmrDiversitySelect(candidates: Candidate[], k: number, maxPerCategory: number, lambda = 0.75): Candidate[] {
  const pool = [...candidates];
  const selected: Candidate[] = [];
  const categoryCounts = new Map<string, number>();
  const maxScore = Math.max(...pool.map((c) => c.score), 1e-9);
  const minScore = Math.min(...pool.map((c) => c.score), 0);
  const range = Math.max(1e-9, maxScore - minScore);

  while (selected.length < k && pool.length > 0) {
    let bestIdx = -1;
    let bestVal = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      const count = categoryCounts.get(c.intervention.category) ?? 0;
      if (count >= maxPerCategory) continue;
      const relevance = (c.score - minScore) / range;
      const maxSim = selected.some((s) => s.intervention.category === c.intervention.category) ? 1 : 0;
      const val = lambda * relevance - (1 - lambda) * maxSim;
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break; // every remaining candidate is at its category cap
    const chosen = pool[bestIdx];
    selected.push(chosen);
    categoryCounts.set(chosen.intervention.category, (categoryCounts.get(chosen.intervention.category) ?? 0) + 1);
    pool.splice(bestIdx, 1);
  }
  return selected;
}

function pickSerendipitySlot(candidates: Candidate[], alreadySelected: Candidate[]): Candidate | undefined {
  const selectedIds = new Set(alreadySelected.map((c) => c.intervention.id));
  const pool = candidates.filter(
    (c) =>
      !selectedIds.has(c.intervention.id) &&
      c.fit < SERENDIPITY_FIT_CEILING &&
      EVIDENCE_CLASS_RANK[c.evidenceClass] >= EVIDENCE_CLASS_RANK.experimental &&
      c.sampleSize >= MIN_CONFIDENT_SAMPLE_SIZE &&
      c.expectedUtility > 0,
  );
  if (pool.length === 0) return undefined;
  pool.sort((a, b) => b.expectedUtility - a.expectedUtility);
  return pool[0];
}

function toRankedRecommendation(c: Candidate, context: Context, isSerendipity: boolean): RankedRecommendation {
  const effect = {
    value: c.effectValue,
    interval: c.effectInterval,
    evidenceClass: c.evidenceClass,
    sampleSize: c.sampleSize,
    assumptions: c.assumptions,
    lastUpdated: c.lastUpdated,
  };
  const explainability = buildExplainabilityCard(c.intervention, context, effect, c.matchedContexts, isSerendipity);
  const lint = lintExplainabilityCard(explainability);
  if (!lint.valid) {
    // Fail loudly in all environments: a recommendation without the full
    // five-field contract must never be rendered (Phase 3c lint).
    throw new Error(`explainability lint failed for ${c.intervention.slug}: ${lint.errors.join(", ")}`);
  }
  const breakdown: ScoreBreakdown = {
    expectedUtility: c.expectedUtility,
    contextFit: c.fit,
    freshness: c.freshness,
    diversityPenalty: 0,
    final: c.score,
  };
  return {
    intervention: c.intervention,
    effect,
    contextKey: canonicalizeContext(context),
    score: c.score,
    scoreBreakdown: breakdown,
    isSerendipity,
    explainability,
  };
}

export interface ActionDeskOptions {
  listSize?: number;
  maxPerCategory?: number;
  allowSerendipity?: boolean;
  persist?: boolean;
}

export async function computeActionDesk(
  orgId: string,
  context: Context,
  options: ActionDeskOptions = {},
): Promise<ActionDeskResult> {
  const listSize = options.listSize ?? 5;
  const maxPerCategory = options.maxPerCategory ?? 2;
  const allowSerendipity = options.allowSerendipity ?? true;
  const persist = options.persist ?? true;

  await ensureInterventionsSeeded();
  const interventions = await listInterventions();
  const candidates = await buildCandidates(interventions, context);

  // Confidence bar: a prior-only belief (sampleSize 0 — no org-specific
  // measurement has ever happened) is NEVER enough on its own, no matter how
  // promising its literature-derived evidence class looks. Once at least one
  // verified outcome exists, non-anecdotal evidence can surface immediately;
  // anecdotal evidence needs a larger sample (n>=5) before it is considered
  // confident. This is what makes "no confident recommendation" reachable
  // for genuinely new/sparse-data orgs (Gate 4).
  const confident = candidates.filter(
    (c) =>
      c.score > MIN_CONFIDENT_SCORE &&
      c.sampleSize > 0 &&
      (c.evidenceClass !== "anecdotal" || c.sampleSize >= MIN_CONFIDENT_SAMPLE_SIZE),
  );

  if (confident.length === 0) {
    const withAnyData = candidates.filter((c) => c.sampleSize > 0).length;
    const dataCompleteness = candidates.length > 0 ? withAnyData / candidates.length : 0;
    return {
      status: "no_confident_recommendation",
      reason:
        "No intervention currently clears the confidence bar (positive expected utility AND either non-anecdotal evidence or n>=5) for this context. Rendering an empty state rather than padding the list with noise.",
      dataCompleteness,
    };
  }

  const inProfile = confident.filter((c) => c.fit >= SERENDIPITY_FIT_CEILING);
  const reserveForSerendipity = allowSerendipity ? 1 : 0;
  const mainSlots = Math.max(1, listSize - reserveForSerendipity);

  const sortedInProfile = [...inProfile].sort((a, b) => b.score - a.score);
  const mainSelection = mmrDiversitySelect(sortedInProfile, mainSlots, maxPerCategory);

  const recommendations: RankedRecommendation[] = mainSelection.map((c) => toRankedRecommendation(c, context, false));

  if (allowSerendipity) {
    const serendipityCandidate = pickSerendipitySlot(candidates, mainSelection);
    if (serendipityCandidate) {
      recommendations.push(toRankedRecommendation(serendipityCandidate, context, true));
    }
  }

  if (persist) {
    const contextKey = canonicalizeContext(context);
    for (let i = 0; i < recommendations.length; i++) {
      const r = recommendations[i];
      const id = randomUUID();
      await db.insert(recRecommendations).values({
        id,
        orgId,
        interventionId: r.intervention.id,
        contextKey,
        contextSnapshot: context,
        score: r.score,
        scoreBreakdown: r.scoreBreakdown,
        rank: i + 1,
        isSerendipity: r.isSerendipity,
        explainability: r.explainability,
        status: "pending",
      });
      r.recommendationId = id;
    }
  }

  return { status: "ok", recommendations };
}
