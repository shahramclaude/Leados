export interface DeliveryConfidenceInput {
  overdueMilestones: number;
  criticalBlockers: number;
}

/**
 * Delivery confidence (0-100) for a project. Overdue milestones and critical
 * blockers each subtract from a baseline of 100; the result is clamped so it
 * can never dip below 0 even when a project is deeply overdue/blocked.
 */
export function computeDeliveryConfidence(input: DeliveryConfidenceInput): number {
  const raw = 100 - input.overdueMilestones * 15 - input.criticalBlockers * 20;
  return Math.max(0, Math.min(100, raw));
}
