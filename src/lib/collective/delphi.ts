// Part 44 — Delphi engine: multi-round structured elicitation (pure functions).
//
// Flow per round:
//   1. Participants submit anonymized estimates + rationale (identity hidden behind
//      `anonymousTag`, see schema `forecasters.anonymousTag`).
//   2. Controlled feedback is generated ONLY from closed rounds: a distribution summary
//      (buckets + mean/median/stdDev) and a de-duplicated, anonymized sample of rationales
//      — never raw identity-linked statements, and never while the round is still open
//      (that would leak live positions and trigger herding, see anti-herding note below).
//   3. Forecasters re-estimate in the next round having seen only the summarized feedback.
//   4. Convergence is tracked round over round (σ reduction); stopping rules halt the
//      process once improvement plateaus or a round cap is hit.
//
// ANTI-HERDING: in `anonymous_delayed` mode (the default and recommended mode), a
// round's individual estimates are not revealed to other participants until the round
// is CLOSED — nobody can see "what others currently think" and anchor on it mid-round.
// This is what the herding simulation in `simulation.ts` tests against an `open` mode
// baseline where positions are visible live.
//
// DISSENT PRESERVATION: estimates more than `dissentThreshold` away from the round mean
// are flagged `isDissent` and are never dropped from the stored record, even after the
// panel converges — they ship in the final report (see `DelphiRoundSummary.dissenters`).

import { clip, mean, stdDev } from "./aggregation";

export interface DelphiEstimateInput {
  forecasterId: string;
  anonymousTag: string;
  estimate: number; // 0..1
  rationale: string;
}

export interface DelphiRoundSummary {
  roundNumber: number;
  n: number;
  mean: number;
  median: number;
  stdDev: number;
  /** Histogram buckets of width 0.1 over [0,1], used for "controlled feedback". */
  buckets: Array<{ range: string; count: number }>;
  /** Anonymized, de-duplicated rationale snippets shown back to the panel (no identity). */
  rationaleSample: string[];
  dissenters: Array<{ anonymousTag: string; estimate: number; rationale: string; divergence: number }>;
}

export const DEFAULT_DISSENT_THRESHOLD = 0.2;

export function median(values: number[]): number {
  if (values.length === 0) return 0.5;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function bucketize(values: number[]): Array<{ range: string; count: number }> {
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    range: `${(i / 10).toFixed(1)}-${((i + 1) / 10).toFixed(1)}`,
    count: 0,
  }));
  for (const v of values) {
    const idx = Math.min(9, Math.max(0, Math.floor(clip(v) * 10)));
    buckets[idx].count += 1;
  }
  return buckets;
}

/** Summarize a CLOSED round into controlled feedback for the next round. */
export function summarizeRound(
  roundNumber: number,
  estimates: DelphiEstimateInput[],
  dissentThreshold: number = DEFAULT_DISSENT_THRESHOLD,
): DelphiRoundSummary {
  const values = estimates.map((e) => clip(e.estimate));
  const m = mean(values);
  const sd = stdDev(values);
  const dissenters = estimates
    .map((e, i) => ({
      anonymousTag: e.anonymousTag,
      estimate: values[i],
      rationale: e.rationale,
      divergence: Math.abs(values[i] - m),
    }))
    .filter((d) => d.divergence >= dissentThreshold)
    .sort((a, b) => b.divergence - a.divergence);

  // Controlled feedback: sample up to 5 distinct, anonymized rationales (shortest-first
  // dedupe by trimmed text) so the panel sees *reasoning diversity* without headcounts
  // that could trigger bandwagon effects.
  const seen = new Set<string>();
  const rationaleSample: string[] = [];
  for (const e of estimates) {
    const key = e.rationale.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rationaleSample.push(e.rationale.trim());
    if (rationaleSample.length >= 5) break;
  }

  return {
    roundNumber,
    n: values.length,
    mean: m,
    median: median(values),
    stdDev: sd,
    buckets: bucketize(values),
    rationaleSample,
    dissenters,
  };
}

export interface ConvergenceStep {
  roundNumber: number;
  mean: number;
  stdDev: number;
  stdDevDelta: number | null; // negative = converging
  dissentCount: number;
}

export interface StoppingDecision {
  stop: boolean;
  reason: string;
}

export interface StoppingRuleOptions {
  maxRounds?: number;
  /** Stop once σ reduction between rounds falls below this (diminishing returns). */
  minStdDevImprovement?: number;
  /** Stop once σ itself is below this (panel has effectively converged). */
  convergedStdDev?: number;
}

const DEFAULT_STOPPING: Required<StoppingRuleOptions> = {
  maxRounds: 5,
  minStdDevImprovement: 0.01,
  convergedStdDev: 0.05,
};

/** Build the round-over-round convergence series from a list of per-round estimate sets. */
export function computeConvergence(
  roundsOfEstimates: DelphiEstimateInput[][],
  dissentThreshold: number = DEFAULT_DISSENT_THRESHOLD,
): ConvergenceStep[] {
  const steps: ConvergenceStep[] = [];
  let prevStdDev: number | null = null;
  roundsOfEstimates.forEach((estimates, idx) => {
    const summary = summarizeRound(idx + 1, estimates, dissentThreshold);
    steps.push({
      roundNumber: idx + 1,
      mean: summary.mean,
      stdDev: summary.stdDev,
      stdDevDelta: prevStdDev === null ? null : summary.stdDev - prevStdDev,
      dissentCount: summary.dissenters.length,
    });
    prevStdDev = summary.stdDev;
  });
  return steps;
}

/** Apply stopping rules against the convergence series so far. Dissent is NEVER a stop trigger. */
export function evaluateStoppingRule(
  convergence: ConvergenceStep[],
  options: StoppingRuleOptions = {},
): StoppingDecision {
  const opts = { ...DEFAULT_STOPPING, ...options };
  if (convergence.length === 0) return { stop: false, reason: "no rounds yet" };
  const last = convergence[convergence.length - 1];

  if (convergence.length >= opts.maxRounds) {
    return { stop: true, reason: `reached max rounds (${opts.maxRounds})` };
  }
  if (last.stdDev <= opts.convergedStdDev) {
    return { stop: true, reason: `stdDev ${last.stdDev.toFixed(4)} <= converged threshold ${opts.convergedStdDev}` };
  }
  if (last.stdDevDelta !== null && Math.abs(last.stdDevDelta) < opts.minStdDevImprovement) {
    return {
      stop: true,
      reason: `stdDev improvement ${last.stdDevDelta.toFixed(4)} below minimum ${opts.minStdDevImprovement} (diminishing returns)`,
    };
  }
  return { stop: false, reason: "convergence still improving" };
}
