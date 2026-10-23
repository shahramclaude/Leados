// LEADOS — Part 28 "process mining" dependency stand-in
//
// Honesty note (see temporal.ts header): the real Part 28 process-mining
// pipeline was not present in this checkout. Part 45 only needs a narrow
// slice of that capability — detecting streaks/patterns across a
// recurring meeting's instance history — so this module implements just
// that, as a simple, auditable function rather than a full mining engine.

export interface OutcomeInstance {
  eventId: string;
  occurredAt: Date;
  decisionsCount: number;
  actionsCount: number;
}

export interface RecurringMeetingPattern {
  recurrenceKey: string;
  instanceCount: number;
  zeroOutcomeStreakWeeks: number;
  totalOutcomes: number;
  trendDirection: "improving" | "flat" | "declining";
}

export function mineRecurringPattern(
  recurrenceKey: string,
  instances: OutcomeInstance[],
): RecurringMeetingPattern {
  const sorted = [...instances].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].decisionsCount + sorted[i].actionsCount === 0) {
      streak += 1;
    } else {
      break;
    }
  }

  const totalOutcomes = sorted.reduce((acc, o) => acc + o.decisionsCount + o.actionsCount, 0);

  const half = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, half);
  const secondHalf = sorted.slice(half);
  const avg = (arr: OutcomeInstance[]) =>
    arr.length === 0 ? 0 : arr.reduce((acc, o) => acc + o.decisionsCount + o.actionsCount, 0) / arr.length;
  const firstAvg = avg(firstHalf);
  const secondAvg = avg(secondHalf);

  let trendDirection: RecurringMeetingPattern["trendDirection"] = "flat";
  if (secondAvg > firstAvg * 1.15) trendDirection = "improving";
  else if (secondAvg < firstAvg * 0.85) trendDirection = "declining";

  return {
    recurrenceKey,
    instanceCount: sorted.length,
    zeroOutcomeStreakWeeks: streak,
    totalOutcomes,
    trendDirection,
  };
}
