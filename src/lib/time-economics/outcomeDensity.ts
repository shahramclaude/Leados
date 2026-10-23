// LEADOS — Part 45: Outcome-density / meeting value scoring.
//
// outcomeDensity = (decisions + actions) / duration(hours)   [from Part 25 capture]
// valueScore     = outcomeDensity / (totalCost / duration(hours))
//                = outcomes per currency-hour of cost spent
//
// A recurring meeting whose trailing N instances are all zero-outcome is
// flagged explicitly (this is the headline finding the brief asks for).

import { suggestCadenceChange } from "./ritualEngine";
import type { MeetingOutcomeRecord, CadenceSuggestion } from "./ritualEngine";
import { mineRecurringPattern } from "./processMining";
import type { OutcomeInstance } from "./processMining";

export interface ValueScoreInput {
  eventId: string;
  recurrenceKey: string | null;
  durationHours: number;
  totalCost: number;
  decisionsCount: number;
  actionsCount: number;
}

export interface ValueScoreResult {
  eventId: string;
  outcomeDensityPerHour: number;
  costPerHour: number;
  valueScore: number; // outcomes per currency unit spent, scaled ×1000 for readability
  flags: string[];
}

export function computeValueScore(input: ValueScoreInput): ValueScoreResult {
  const outcomes = input.decisionsCount + input.actionsCount;
  const outcomeDensityPerHour = input.durationHours > 0 ? outcomes / input.durationHours : 0;
  const costPerHour = input.durationHours > 0 ? input.totalCost / input.durationHours : 0;
  // outcomes per $1,000 of cost — avoids a near-zero denominator blowing up the ratio
  const valueScore = input.totalCost > 0 ? (outcomes / input.totalCost) * 1000 : outcomes > 0 ? Infinity : 0;

  const flags: string[] = [];
  if (outcomes === 0 && input.totalCost > 0) {
    flags.push("Zero outcomes captured for this occurrence despite nonzero cost.");
  }

  return {
    eventId: input.eventId,
    outcomeDensityPerHour: round2(outcomeDensityPerHour),
    costPerHour: round2(costPerHour),
    valueScore: Number.isFinite(valueScore) ? round2(valueScore) : 999999,
    flags,
  };
}

export interface RecurringMeetingAudit {
  recurrenceKey: string;
  instanceCount: number;
  zeroOutcomeStreakWeeks: number;
  trendDirection: "improving" | "flat" | "declining";
  avgOutcomeDensityPerHour: number;
  avgCostPerOccurrence: number;
  cadenceSuggestion: CadenceSuggestion;
  headlineFinding: string | null;
}

export function auditRecurringMeeting(
  recurrenceKey: string,
  outcomeHistory: Array<{ eventId: string; occurredAt: Date; decisionsCount: number; actionsCount: number; cost: number; durationMinutes: number }>,
  zeroOutcomeWeeksThreshold: number,
): RecurringMeetingAudit {
  const miningInstances: OutcomeInstance[] = outcomeHistory.map((o) => ({
    eventId: o.eventId,
    occurredAt: o.occurredAt,
    decisionsCount: o.decisionsCount,
    actionsCount: o.actionsCount,
  }));
  const pattern = mineRecurringPattern(recurrenceKey, miningInstances);

  const cadenceRecords: MeetingOutcomeRecord[] = outcomeHistory.map((o) => ({
    eventId: o.eventId,
    decisionsCount: o.decisionsCount,
    actionsCount: o.actionsCount,
    occurredAt: o.occurredAt,
  }));
  const avgDurationMinutes =
    outcomeHistory.length > 0
      ? outcomeHistory.reduce((acc, o) => acc + o.durationMinutes, 0) / outcomeHistory.length
      : 30;
  const cadenceSuggestion = suggestCadenceChange(cadenceRecords, zeroOutcomeWeeksThreshold, avgDurationMinutes);

  const totalOutcomeHours = outcomeHistory.reduce((acc, o) => acc + o.durationMinutes / 60, 0);
  const avgOutcomeDensityPerHour =
    totalOutcomeHours > 0 ? pattern.totalOutcomes / totalOutcomeHours : 0;
  const avgCostPerOccurrence =
    outcomeHistory.length > 0
      ? outcomeHistory.reduce((acc, o) => acc + o.cost, 0) / outcomeHistory.length
      : 0;

  const headlineFinding =
    pattern.zeroOutcomeStreakWeeks >= zeroOutcomeWeeksThreshold
      ? `Recurring meeting with zero outcomes for ${pattern.zeroOutcomeStreakWeeks} consecutive occurrences (threshold: ${zeroOutcomeWeeksThreshold}).`
      : null;

  return {
    recurrenceKey,
    instanceCount: pattern.instanceCount,
    zeroOutcomeStreakWeeks: pattern.zeroOutcomeStreakWeeks,
    trendDirection: pattern.trendDirection,
    avgOutcomeDensityPerHour: round2(avgOutcomeDensityPerHour),
    avgCostPerOccurrence: round2(avgCostPerOccurrence),
    cadenceSuggestion,
    headlineFinding,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
