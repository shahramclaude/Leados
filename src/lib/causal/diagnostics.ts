/**
 * src/lib/causal/diagnostics.ts
 * Cross-cutting diagnostics used by every causal surface: placebo tests
 * (fake treatment dates / fake assignment) and sensitivity analysis
 * (E-value / Rosenbaum bounds) for unmeasured confounding.
 */
import { mulberry32 } from "../mathUtils";
import { eValue, rosenbaumBounds } from "../stats";
import type { DiDRow, DiDResult } from "./estimators/did";
import { runDiD } from "./estimators/did";

export interface PlaceboRunResult {
  nTrials: number;
  nSignificant: number;
  shareSignificant: number;
  /** Gate: placebo tests should be non-significant in >= 90% of runs (i.e. shareSignificant <= 0.10). */
  passed: boolean;
  trialPValues: number[];
}

/**
 * Fake-treatment-date placebo test for DiD-style designs: randomly reassign
 * the "post" cutoff to a pre-intervention period many times and verify the
 * estimated effect is almost never significant. A real effect should NOT be
 * recoverable from a period where nothing happened.
 */
export function placeboFakeDates(rows: DiDRow[], realCutoffTime: number, opts: { nTrials?: number; seed?: number; alpha?: number } = {}): PlaceboRunResult {
  const { nTrials = 200, seed = 123, alpha = 0.1 } = opts;
  const rand = mulberry32(seed);
  const times = Array.from(new Set(rows.map((r) => r.time))).sort((a, b) => a - b);
  const preTimes = times.filter((t) => t < realCutoffTime);
  const trialPValues: number[] = [];

  // Require at least 2 pseudo-pre and 2 pseudo-post periods on each side of the
  // fake cutoff. Cutoffs at the very edge of the pre-period leave only one
  // period on one side, which starves the DiD interaction term of
  // identifying variation and produces an unstable (sometimes spuriously
  // "significant") estimate that has nothing to do with a real effect.
  const minIdx = 2;
  const maxIdx = preTimes.length - 2;

  for (let trial = 0; trial < nTrials; trial++) {
    if (preTimes.length < 4 || maxIdx < minIdx) break; // not enough pre-period to fake a stable cutoff
    const fakeCutoffIdx = minIdx + Math.floor(rand() * (maxIdx - minIdx + 1));
    const fakeCutoff = preTimes[fakeCutoffIdx];
    const fakeRows: DiDRow[] = rows
      .filter((r) => r.time <= Math.max(...preTimes)) // restrict to the real pre-period only
      .map((r) => ({ ...r, post: r.time >= fakeCutoff }));
    try {
      const res: DiDResult = runDiD(fakeRows);
      trialPValues.push(res.pValue);
    } catch {
      // skip degenerate resamples
    }
  }

  const nSignificant = trialPValues.filter((p) => p < alpha).length;
  const shareSignificant = trialPValues.length > 0 ? nSignificant / trialPValues.length : 1;
  return {
    nTrials: trialPValues.length,
    nSignificant,
    shareSignificant,
    passed: shareSignificant <= 0.1,
    trialPValues,
  };
}

/**
 * Generic permutation placebo: shuffle the treatment-assignment label `nTrials`
 * times and recompute an arbitrary estimator; returns the share of shuffles
 * that produced an effect "as extreme" as the real one (two-sided).
 */
export function placeboPermutation<T extends { treated: boolean }>(
  rows: T[],
  estimatorFn: (shuffled: T[]) => number,
  realEstimate: number,
  opts: { nTrials?: number; seed?: number } = {},
): { pValue: number; nTrials: number } {
  const { nTrials = 200, seed = 321 } = opts;
  const rand = mulberry32(seed);
  const treatedFlags = rows.map((r) => r.treated);
  let extremeCount = 0;
  let ran = 0;
  for (let i = 0; i < nTrials; i++) {
    const shuffled = [...treatedFlags];
    for (let j = shuffled.length - 1; j > 0; j--) {
      const k = Math.floor(rand() * (j + 1));
      [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }
    const permutedRows = rows.map((r, idx) => ({ ...r, treated: shuffled[idx] }));
    try {
      const est = estimatorFn(permutedRows);
      ran++;
      if (Math.abs(est) >= Math.abs(realEstimate)) extremeCount++;
    } catch {
      // skip
    }
  }
  return { pValue: ran > 0 ? (extremeCount + 1) / (ran + 1) : 1, nTrials: ran };
}

export interface SensitivityReport {
  type: "e-value" | "rosenbaum-gamma" | "none";
  value: number | null;
  interpretation: string;
}

/** Produce a sensitivity report for an SMD-style continuous-outcome estimate (E-value route). */
export function sensitivityForContinuousEstimate(estimateSmd: number, ciBoundNearNullSmd: number): SensitivityReport {
  const { pointEValue, ciEValue } = eValue(estimateSmd, ciBoundNearNullSmd);
  return {
    type: "e-value",
    value: Number(ciEValue.toFixed(2)),
    interpretation: `An unmeasured confounder would need to be associated with both the treatment and the outcome by a risk-ratio of at least ${ciEValue.toFixed(
      2,
    )}x (point estimate ${pointEValue.toFixed(2)}x) to fully explain away this effect. Everyday confounders (e.g. a hiring freeze, a seasonal demand swing) are usually well below that bar unless flagged otherwise.`,
  };
}

/** Produce a Rosenbaum-style sensitivity report for matched-pair style estimates. */
export function sensitivityForMatchedPairs(pairedDiffs: number[]): SensitivityReport {
  const bounds = rosenbaumBounds(pairedDiffs);
  const breakPoint = bounds.find((b) => b.worstCaseP > 0.05);
  const gamma = breakPoint ? breakPoint.gamma : bounds[bounds.length - 1].gamma;
  return {
    type: "rosenbaum-gamma",
    value: gamma,
    interpretation: `Significance could be lost if an unmeasured confounder made matched units differ in their odds of treatment by a factor of about Gamma = ${gamma}. Lower Gamma (closer to 1) means the finding is fragile to hidden confounding; this one needs a Gamma of ${gamma} before conclusions flip.`,
  };
}
