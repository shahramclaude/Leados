// src/lib/timeEconomics.ts
//
// RECONSTRUCTION NOTE: see src/lib/circadian.ts header. Stand-in for Part
// 45's "time economics" module. Exposes the minimal meeting-load and
// scheduling-optimizer surface Part 52 integrates with:
//   - meeting-load accounting, used as an input to the decision-load model
//   - a `CapacitySignal` shape and `applyCapacitySignal` hook representing
//     "the optimizer", which Part 52 calls with a grant-gated signal only
//     (never raw leader-state records).

export interface DaySchedule {
  date: string; // YYYY-MM-DD, person-local
  meetingMinutes: number;
  deepWorkBlocksPlanned: number;
  deepWorkBlocksHonored: number;
  quietHoursKept: boolean;
}

/** 0 (light) .. 1 (saturated) meeting-load factor for a single day. */
export function meetingLoadFactor(day: Pick<DaySchedule, "meetingMinutes">): number {
  const SATURATION_MINUTES = 360; // 6 hours of meetings = fully saturated
  return Math.max(0, Math.min(1, day.meetingMinutes / SATURATION_MINUTES));
}

export interface CapacitySignal {
  ownerUserId: string;
  asOf: Date;
  /** 0 (depleted) .. 1 (ample) coarse capacity estimate, self-scope derived. */
  capacityScore: number;
  /** Suggested time buckets for high-stakes decisions, from the person's own history. */
  suggestedDecisionWindows: string[];
  /** Always carried through so the optimizer never presents this as certain. */
  confidence: "low" | "moderate";
  sourceSampleSize: number;
}

export interface SchedulingAdjustment {
  note: string;
  protectWindow?: string;
}

/**
 * Stand-in for Part 45's optimizer entry point. In the real module this
 * would re-rank meeting placement; here it only demonstrates the contract:
 * it NEVER receives raw leader-state records, only a `CapacitySignal` that
 * leaderState/capacitySignals.ts has already derived and that was released
 * under an active, unexpired, owner-issued grant.
 */
export function applyCapacitySignal(signal: CapacitySignal): SchedulingAdjustment {
  if (signal.sourceSampleSize < 3) {
    return {
      note: "Not enough of your own history yet to suggest a protected window.",
    };
  }
  const [firstWindow] = signal.suggestedDecisionWindows;
  return {
    note:
      signal.confidence === "low"
        ? `Weak signal only: your past high-stakes decisions have slightly favored ${firstWindow ?? "no particular window"}.`
        : `Your own history suggests ${firstWindow ?? "no particular window"} for high-stakes decisions. This is a suggestion, not a rule.`,
    protectWindow: firstWindow,
  };
}
