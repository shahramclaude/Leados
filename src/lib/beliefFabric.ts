// =============================================================================
// Leados — Belief Fabric (Part 1, minimal rebuild)
// -----------------------------------------------------------------------------
// Not present in this checkout. Rebuilt at minimal fidelity: a simple Beta-
// Binomial posterior over "execution risk" driven by observed blocker/
// milestone-slip signals, exposed as a single scalar in [0,1] that Part 6
// consumes as `executionRiskPosterior`.
// =============================================================================

import type { Blocker, Milestone, Project } from "./types";

export interface ExecutionRiskSignal {
  successes: number; // evidence execution is healthy
  failures: number; // evidence execution is at risk
}

/**
 * computeExecutionRiskPosterior(projects, milestones, blockers): number
 * Beta(alpha, beta) posterior mean over org-wide execution risk, where
 * alpha/beta are seeded with weak uniform priors (1,1) and updated by
 * overdue milestones (failure evidence) vs done milestones (success
 * evidence), and severity-weighted blockers (failure evidence).
 */
export function computeExecutionRiskPosterior(
  projects: Project[],
  milestones: Milestone[],
  blockers: Blocker[],
): number {
  let alpha = 1; // risk-present pseudo-count
  let beta = 1; // risk-absent pseudo-count

  for (const m of milestones) {
    if (m.status === "done") beta += 1;
    if (m.status === "overdue") alpha += 2;
  }

  for (const b of blockers) {
    if (b.resolvedAt) {
      beta += 0.5;
    } else {
      alpha += b.severity >= 4 ? 2 : 1;
    }
  }

  for (const p of projects) {
    if (p.status === "blocked") alpha += 1.5;
    if (p.status === "complete") beta += 1;
  }

  return alpha / (alpha + beta);
}
