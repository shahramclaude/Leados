// Growth-plan helpers: progress rollups linked to skill evidence.

import type { GrowthPlan } from "../types";

export interface GrowthPlanProgress {
  planId: number;
  totalMilestones: number;
  completedMilestones: number;
  percentComplete: number;
  milestonesWithoutEvidence: number;
}

export function computeGrowthProgress(plan: GrowthPlan): GrowthPlanProgress {
  const total = plan.milestones.length;
  const completed = plan.milestones.filter((m) => m.completedAt != null).length;
  const missingEvidence = plan.milestones.filter(
    (m) => m.completedAt != null && m.evidence.length === 0,
  ).length;

  return {
    planId: plan.id,
    totalMilestones: total,
    completedMilestones: completed,
    percentComplete: total === 0 ? 0 : Number(((completed / total) * 100).toFixed(1)),
    milestonesWithoutEvidence: missingEvidence,
  };
}
