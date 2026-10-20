/**
 * driftDetection.ts — Part 04-D drift detection, wired to the "rule health"
 * surface via `signalFusion.ts`. Combines two independent detectors so a
 * slow distributional shift (PSI) and a sudden mean-shift in residuals
 * (CUSUM) are both caught:
 *
 *  - PSI (Population Stability Index, `stats.populationStabilityIndex`) on
 *    the rule's score distribution, baseline (golden/history) vs current
 *    window. Threshold 0.25 = "major drift" (industry rule of thumb, see
 *    stats.ts citation).
 *  - CUSUM (`stats.cusumStep`) on the rule's residuals (predicted - actual),
 *    detecting a sustained bias the single-point PSI check might miss.
 *
 * Crossing either threshold emits a `RawSignal` with `rootCauseKey
 * "rule-health:<ruleId>"`, which `signalFusion.fuseSignals` turns into a
 * `Finding` the UI's rule-health panel renders — this is the "wire them to
 * this truth" requirement in the standing order: there is no separate,
 * hand-written rule-health score anywhere else in the codebase.
 */

import { cusumInit, cusumStep, populationStabilityIndex, type CusumState } from "../../domain/intelligence/stats";
import type { EvidenceRef, RawSignal } from "../../domain/intelligence/types";

export const PSI_MAJOR_DRIFT_THRESHOLD = 0.25;
export const CUSUM_K = 0.5; // allowance, in residual units
export const CUSUM_H = 4; // decision interval

class RuleHealthMonitor {
  private cusumByRule = new Map<string, CusumState>();

  private cusumFor(ruleId: string): CusumState {
    return this.cusumByRule.get(ruleId) ?? cusumInit();
  }

  /** Feed one evaluation window's worth of data for a rule and get back a
   * `RawSignal` (always returned, even when healthy, at a low score) so
   * callers can run it through `signalFusion.fuseSignals` uniformly. */
  evaluate(
    ruleId: string,
    baselineScores: number[],
    currentScores: number[],
    residuals: number[],
    observedAt: string,
  ): RawSignal {
    const psi = populationStabilityIndex(baselineScores, currentScores, 10, 0, 1);

    let cusum = this.cusumFor(ruleId);
    for (const r of residuals) {
      cusum = cusumStep(cusum, r, 0, CUSUM_K, CUSUM_H);
    }
    this.cusumByRule.set(ruleId, cusum);

    const psiSeverityScore = Math.min(1, psi / PSI_MAJOR_DRIFT_THRESHOLD) * 0.6;
    const cusumSeverityScore = cusum.alarmed ? 0.9 : 0;
    const score = Math.max(psiSeverityScore, cusumSeverityScore);

    const evidence: EvidenceRef[] = [
      {
        id: `drift:${ruleId}:psi:${observedAt}`,
        kind: "metric",
        sourceId: `rule:${ruleId}`,
        weightApplied: 1,
        observedAt,
        description: `PSI(baseline, current) = ${psi.toFixed(4)} (major-drift threshold ${PSI_MAJOR_DRIFT_THRESHOLD})`,
      },
      {
        id: `drift:${ruleId}:cusum:${observedAt}`,
        kind: "metric",
        sourceId: `rule:${ruleId}`,
        weightApplied: 1,
        observedAt,
        description: `CUSUM sHi=${cusum.sHi.toFixed(3)} sLo=${cusum.sLo.toFixed(3)} alarmed=${cusum.alarmed}`,
      },
    ];

    return {
      id: `drift-signal:${ruleId}:${observedAt}`,
      rootCauseKey: `rule-health:${ruleId}`,
      sourceId: `rule:${ruleId}`,
      score,
      observedAt,
      description: `Rule health check for ${ruleId}`,
      evidence,
    };
  }

  resetForTests() {
    this.cusumByRule.clear();
  }
}

export const ruleHealthMonitor = new RuleHealthMonitor();
