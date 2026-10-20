/**
 * explainAdapters.ts — Part 04-B glue: turns the domain's richer internal
 * types (`Belief`, `Finding`) into the one `Explain<T>` shape every
 * component/eval-harness check consumes. Used by BOTH
 * `src/components/intelligence/adapters.ts` (UI) and
 * `src/lib/eval/evalIntelligence.ts` (harness coverage check) — one
 * implementation, two consumers, so they can never drift apart.
 */

import { explainFinding } from "./explain";
import { betaMean, betaVariance } from "./types";
import type { Belief, Driver, Explain, Finding } from "./types";

export function beliefToExplain(belief: Belief): Explain<number> {
  const value = belief.posterior.kind === "beta" ? betaMean(belief.posterior) : belief.posterior.kind === "normal" ? belief.posterior.mu : 0;

  const drivers: Driver[] = belief.evidence.map((e) => ({
    factor: e.description,
    contribution: e.weightApplied,
    direction: (e.weightApplied >= 0 ? "up" : "down") as "up" | "down",
    evidence: [e],
  }));

  return explainFinding<number>({
    value,
    interval: { lo: belief.interval.lo, hi: belief.interval.hi },
    drivers,
    evidence: belief.evidence,
    method: `beliefFabric:${belief.method}`,
    asOf: belief.asOf,
  });
}

export function beliefUncertainty(belief: Belief): number {
  if (belief.posterior.kind === "beta") return Math.sqrt(betaVariance(belief.posterior));
  if (belief.posterior.kind === "normal") return belief.posterior.sigma;
  return 0;
}

export function findingToExplain(finding: Finding): Explain<number> {
  const drivers: Driver[] = finding.evidence.map((e) => ({
    factor: e.description,
    contribution: e.weightApplied,
    direction: (finding.score >= 0.5 ? "up" : "down") as "up" | "down",
    evidence: [e],
  }));

  return explainFinding<number>({
    value: finding.score,
    drivers,
    evidence: finding.evidence,
    method: "signalFusion:severity-state-machine-with-hysteresis",
    asOf: finding.updatedAt,
    counterfactual: [
      {
        change: `score drops below ${(finding.score - 0.1).toFixed(2)}`,
        newValue: Math.max(0, finding.score - 0.1),
      },
    ],
  });
}
