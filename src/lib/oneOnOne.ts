function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export interface OneOnOneQualityInput {
  /** Days since the person's last 1:1, or null if none ever occurred. */
  daysSinceLast: number | null;
  actionItemsTotal: number;
  actionItemsCompleted: number;
}

/**
 * Quality score (0-100) for a person's 1:1 cadence and follow-through.
 * Recency and action-item completion are each clamped into [0, 100] before
 * being blended, so a long gap since the last 1:1 combined with zero action
 * items floors out at exactly 0 — it can never go negative.
 */
export function computeOneOnOneQuality(input: OneOnOneQualityInput): number {
  const daysSinceLast = input.daysSinceLast ?? 9999;
  const recencyScore = clamp(100 - daysSinceLast * 4, 0, 100);
  const actionScore =
    input.actionItemsTotal > 0
      ? clamp((input.actionItemsCompleted / input.actionItemsTotal) * 100, 0, 100)
      : 0;
  return clamp(recencyScore * 0.6 + actionScore * 0.4, 0, 100);
}
