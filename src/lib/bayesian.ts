// LeadOS pt-S — Bayesian Belief Network Engine.
//
// PROVENANCE (verified this session against github.com/wbweve/Leados — see
// AI-SESSION-LOG.md for the full ledger):
//   - No file, export, or identifier named `bayesian`, `belief`, `PRIORS`,
//     `LIKELIHOODS`, or anything matching this module was found anywhere in
//     the real repo's tree, `src/lib` listing, `src/App.tsx`, or root
//     `index.html` (grepped directly, this session).
//   - This module is therefore ORIGINAL CODE written to satisfy the task's
//     pasted "pt-S" specification. It is not a port, copy, or continuation
//     of any file in github.com/wbweve/Leados.
//   - The numeric prior/likelihood-ratio VALUES and their cited sources
//     (SHRM, Bessemer, Lattice, Gallup, Leiter & Maslach, Doerr, Reichheld,
//     LinkedIn Talent Trends, etc.) are reproduced verbatim from the pasted
//     brief. They are NOT independently verified against the original
//     publications this session — labeled "unverified citation" throughout
//     the UI and docs. Treat every prior/ratio as an illustrative estimate.
//
// DISCLOSED GAPS IN THE PASTED SPEC ITSELF (found by applying the same
// "inspect before claiming" standard to the brief's own code, not just to
// the GitHub repo):
//   1. `crisis.next30d` and `key_hire.success` have PRIORS entries but NO
//      matching entry in LIKELIHOODS. The spec's own `update()` function
//      returns the prior unchanged when no likelihood function exists
//      (`if (!likelihoodFn) return prior;`) — so, as written, these two
//      hypotheses can NEVER be updated by evidence. Preserved faithfully
//      here (see `hasLikelihoodModel` below) rather than inventing
//      likelihood ratios the brief never specified.
//   2. Five likelihood keys ARE defined (`comp.at_market`, `promotion.recent`,
//      `pipeline.shrinking`, `nps.high`, `velocity.stable`) but the spec's
//      own `_extractEvidenceSignals()` never actually emits any of them —
//      they are dead weights in the brief's own logic. Rather than silently
//      dropping them, this build exposes them as explicit MANUAL toggles in
//      the Signal Board, clearly labeled as "not auto-wired by the spec."
//   3. The spec declares `beliefs: {}` as a running cache and reads
//      `this.beliefs[hypothesis]` as the "prior" on each call, but nothing
//      in the spec ever writes to that cache (it writes posteriors to
//      `state.meta.beliefs` instead, a different object). In effect, every
//      call to `update()` always restarts from the original PRIORS value,
//      not from a prior posterior. This build replicates that exact
//      behavior intentionally: each recompute is a full, stateless
//      re-derivation from the base prior across the *current* evidence
//      snapshot, not a running sequential update. This is disclosed, not
//      silently "fixed," because changing it would misattribute a design
//      decision to a spec that doesn't contain it.

import type {
  AppliedEvidence,
  BeliefResult,
  HypothesisId,
  LikelihoodEntry,
  PriorEntry,
} from "./types";

export const PRIORS: Record<HypothesisId, PriorEntry> = {
  "attrition.next60d": {
    description: "Probability of at least one voluntary departure in the next 60 days",
    prior: 0.15,
    source: "SHRM (2022) voluntary turnover statistics, tech sector. Unverified citation — reproduced from the pasted brief, not checked against the original report this session.",
    label: "Prior probability. Updates with your specific signals.",
  },
  "revenue.miss.next_quarter": {
    description: "Probability of missing revenue target next quarter",
    prior: 0.35,
    source: "Bessemer Venture Partners (2023) SaaS benchmark data. Unverified citation.",
    label: "Prior. Updates with your pipeline and velocity data.",
  },
  "crisis.next30d": {
    description: "Probability of a critical operational crisis in the next 30 days",
    prior: 0.12,
    source: "Heuristic prior. Labeled in the original brief as having no validated source.",
    label: "Prior only — see disclosed gap: no likelihood model exists for this hypothesis.",
  },
  "okr.on_track": {
    description: "Probability that current OKRs will be achieved",
    prior: 0.45,
    source: "Lattice OKR Benchmark Report (2023): 45% achievement rate. Unverified citation.",
    label: "Prior. Updates from your goal-achievement rate.",
  },
  "key_hire.success": {
    description: "Probability that a hire made today will still be with you in 12 months",
    prior: 0.75,
    source: "LinkedIn Talent Trends (2023): ~25% first-year voluntary attrition. Unverified citation.",
    label: "Prior only — see disclosed gap: no likelihood model exists for this hypothesis.",
  },
};

type LikelihoodTable = Partial<Record<HypothesisId, Record<string, LikelihoodEntry>>>;

export const LIKELIHOODS: LikelihoodTable = {
  "attrition.next60d": {
    "mood.declining": {
      likelihoodRatio: 3.0,
      source: "Haid et al. (2022): employee mood trajectory and turnover. Unverified citation.",
    },
    "1on1.missed": {
      likelihoodRatio: 2.5,
      source: "Gallup (2023): manager relationship quality and attrition. Unverified citation.",
    },
    "no_growth_plan": {
      likelihoodRatio: 2.0,
      source: "Lattice (2023): development opportunity and retention. Unverified citation.",
    },
    "conflict.recent": {
      likelihoodRatio: 1.8,
      source: "Heuristic — labeled in the original brief as based on general organizational psychology, no specific citation.",
    },
    "burnout.signal": {
      likelihoodRatio: 4.0,
      source: "Leiter & Maslach (2009): burnout as a turnover predictor. Unverified citation.",
    },
    "comp.at_market": {
      likelihoodRatio: 0.6,
      source: "SHRM (2022): compensation at/above market reduces attrition. Unverified citation.",
    },
    "promotion.recent": {
      likelihoodRatio: 0.4,
      source: "Heuristic from the pasted brief: recent promotion reduces 12-month attrition risk. Unverified citation.",
    },
  },
  "revenue.miss.next_quarter": {
    "win_rate.declining": {
      likelihoodRatio: 3.5,
      source: "Win rate as a leading revenue indicator — SaaS best practice, per the pasted brief. Unverified citation.",
    },
    "pipeline.shrinking": {
      likelihoodRatio: 3.0,
      source: "Pipeline coverage ratio < 3x as a revenue-miss predictor. Unverified citation.",
    },
    "velocity.declining": {
      likelihoodRatio: 2.0,
      source: "Delivery velocity decline predicts feature slip and revenue risk. Unverified citation.",
    },
    "ltv_cac.below_threshold": {
      likelihoodRatio: 2.5,
      source: "LTV:CAC < 3 indicates unsustainable unit economics. Unverified citation.",
    },
    "nps.high": {
      likelihoodRatio: 0.7,
      source: "Reichheld, Net Promoter 3.0: high NPS reduces revenue-miss probability. Unverified citation.",
    },
  },
  "okr.on_track": {
    "goal_hit_rate.high": {
      likelihoodRatio: 2.8,
      source: "Past goal achievement predicts future OKR achievement. Unverified citation.",
    },
    "velocity.stable": {
      likelihoodRatio: 1.8,
      source: "Stable execution velocity supports OKR delivery. Unverified citation.",
    },
    "okr.silent_over_30d": {
      likelihoodRatio: 0.3,
      source: "Doerr (2018): silent OKRs are rarely achieved. Unverified citation.",
    },
  },
  // 'crisis.next30d' and 'key_hire.success' deliberately have no entry here —
  // see disclosed gap #1 above. This is faithful to the pasted spec, not an
  // omission introduced by this build.
};

export interface EvidenceSignals {
  [hypothesis: string]: string[];
}

/**
 * Bayesian update via likelihood-ratio odds form:
 *   posterior odds = prior odds × Π(likelihood ratios of applied evidence)
 *   posterior = odds / (1 + odds)
 * This is algebraically equivalent to iterated application of Bayes' rule
 * (Bayes, 1763) under a naive (conditional-independence) evidence model —
 * the same simplifying assumption the pasted brief's own code makes
 * implicitly by multiplying ratios together.
 */
export function updateBelief(
  hypothesis: HypothesisId,
  evidence: string[],
  today: string // retained for API fidelity with the pasted spec's update(hypothesis, evidence, P, today) signature
): BeliefResult {
  void today;
  const prior = PRIORS[hypothesis]?.prior ?? 0.5;
  const likelihoodFn = LIKELIHOODS[hypothesis];

  if (!likelihoodFn) {
    // Faithful to the spec: no likelihood model -> prior passes through unchanged.
    return {
      prior,
      posterior: prior,
      posteriorPct: Math.round(prior * 100),
      appliedEvidence: [],
      hasLikelihoodModel: false,
      label:
        `No likelihood model exists for "${hypothesis}" in the source spec — ` +
        `posterior equals the unmoved prior (${Math.round(prior * 100)}%). Disclosed gap, not a bug in this build.`,
    };
  }

  let priorOdds = prior / (1 - prior);
  let updatedOdds = priorOdds;
  const appliedEvidence: AppliedEvidence[] = [];

  for (const evidenceKey of evidence) {
    const lf = likelihoodFn[evidenceKey];
    if (!lf) continue;
    updatedOdds *= lf.likelihoodRatio;
    appliedEvidence.push({
      evidence: evidenceKey,
      likelihoodRatio: lf.likelihoodRatio,
      source: lf.source,
      effect: lf.likelihoodRatio > 1 ? "increases" : "decreases",
    });
  }

  const posterior = updatedOdds / (1 + updatedOdds);
  const posteriorPct = Math.round(posterior * 100);

  return {
    prior,
    posterior: Math.round(posterior * 1000) / 1000,
    posteriorPct,
    appliedEvidence,
    hasLikelihoodModel: true,
    label:
      `Bayesian update: P(${hypothesis}|evidence) = ${posteriorPct}%. ` +
      `Prior: ${Math.round(prior * 100)}%. Evidence applied: ${appliedEvidence.length} signal(s). ` +
      `Source: Bayes' theorem (1763). All likelihood ratios labeled with (unverified) sources above.`,
  };
}

export function computeAllBeliefs(
  evidenceSignals: EvidenceSignals,
  today: string
): Record<HypothesisId, BeliefResult> {
  const results = {} as Record<HypothesisId, BeliefResult>;
  for (const hypothesis of Object.keys(PRIORS) as HypothesisId[]) {
    results[hypothesis] = updateBelief(hypothesis, evidenceSignals[hypothesis] || [], today);
  }
  return results;
}

export function highRiskBeliefs(
  beliefs: Record<HypothesisId, BeliefResult>
): [HypothesisId, BeliefResult][] {
  return (Object.entries(beliefs) as [HypothesisId, BeliefResult][])
    .filter(([, v]) => v.posteriorPct >= 60)
    .sort(([, a], [, b]) => b.posteriorPct - a.posteriorPct);
}

/**
 * Linear-regression slope of a short mood series, normalized to roughly
 * [-1, 1] by dividing by series range. Mirrors the role of
 * `LEADOS.flightRisk._computeTrend` referenced (not defined) in the pasted
 * brief — no implementation of that function was found anywhere in the real
 * repo's `src/lib` listing, so this is original code built to satisfy the
 * described behavior ("declining mood trend -> evidence signal").
 */
export function computeMoodTrend(moodValues: number[]): number {
  const n = moodValues.length;
  if (n < 2) return 0;
  const xs = moodValues.map((_, i) => i);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = moodValues.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (moodValues[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const range = Math.max(...moodValues) - Math.min(...moodValues) || 1;
  return slope / range;
}
