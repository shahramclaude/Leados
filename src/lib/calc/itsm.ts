// Part 126 — SLA clock math with pause semantics.

export const PRIORITY_SLA_HOURS: Record<number, number> = {
  1: 4,
  2: 8,
  3: 24,
  4: 72,
};

export function slaHoursForTicket(priority: number, override: number | null | undefined): number {
  if (override != null) return override;
  return PRIORITY_SLA_HOURS[priority] ?? 24;
}

export type SlaEvaluation = {
  resolveByMs: number;
  hoursElapsed: number;
  hoursRemaining: number;
  breached: boolean;
};

// pausedHours is subtracted from elapsed time — the clock does not run while
// waiting on the requester. This is the "pause semantics" rule.
export function evaluateSla(
  createdAt: Date,
  slaHours: number,
  pausedHours: number,
  now: Date,
  resolvedAt: Date | null,
): SlaEvaluation {
  const msPerHour = 60 * 60 * 1000;
  const endPoint = resolvedAt ?? now;
  const rawElapsedHours = (endPoint.getTime() - createdAt.getTime()) / msPerHour;
  const hoursElapsed = Math.max(0, rawElapsedHours - pausedHours);
  const hoursRemaining = slaHours - hoursElapsed;
  const resolveByMs = createdAt.getTime() + (slaHours + pausedHours) * msPerHour;

  return {
    resolveByMs,
    hoursElapsed,
    hoursRemaining,
    breached: hoursRemaining < 0,
  };
}
