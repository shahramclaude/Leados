// LEADOS — Part 45: Calendar optimization engine.
//
// ALGORITHM CHOICE (documented per Phase 1 requirement):
// This uses a GREEDY DISCRETIZED-GRID SEARCH, not a full constraint solver
// (e.g. CP-SAT/ILP). Justification:
//   - Typical request shape is "one meeting, <= ~15 attendees, a multi-day
//     search window" — O(slots × attendees) greedy sweep is fast (<< 50ms)
//     and fully explainable: every rejected slot has one concrete reason
//     attached, which a constraint solver's internal search would not
//     surface as naturally.
//   - A true CP/ILP solver is the right tool for *batch* problems (e.g.
//     "re-optimize every meeting room and recurring series for the whole
//     org simultaneously"). That is explicitly out of scope for this part
//     — see PHASE 5 "what we deliberately did not do".
//   - Hard constraints (required-attendee availability, enforced
//     no-meeting windows, local work-day bounds) are filtered first and
//     absolutely; soft constraints (circadian energy, fragmentation,
//     deep-work preservation) only rank the surviving feasible set. This
//     keeps "feasible" a strict, testable property independent of scoring
//     weights.
//
// T2 GATE: `generateSchedulingSuggestions` NEVER books anything — it only
// returns ranked candidates and persists a `proposed` row. A human must
// call `confirmSuggestion` (a distinct, auditable action) before a slot is
// considered decided, and even then this system has no calendar-write
// integration — confirmation only marks organizational intent, it does
// not silently invite anyone.

import { localDayOfWeek, localMinuteOfDay, overlaps, addMinutes } from "./temporal";
import { circadianEnergy, type Chronotype } from "./circadian";

export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface NoMeetingWindowConstraint {
  dayOfWeek: number; // 0=Sun..6=Sat, local to the applicable user(s)
  startMinute: number;
  endMinute: number;
  enforced: boolean; // only `enforced=true` windows are HARD constraints
  appliesToUserId: string | null; // null = applies to everyone considered
}

export interface AttendeeContext {
  userId: string;
  required: boolean;
  timezone: string;
  chronotype: Chronotype;
  busy: BusyInterval[];
  workDayStartMinute: number;
  workDayEndMinute: number;
}

export interface SchedulingRequest {
  title: string;
  durationMinutes: number;
  earliestStart: Date;
  latestEnd: Date;
  attendees: AttendeeContext[];
  noMeetingWindows: NoMeetingWindowConstraint[];
  candidateGranularityMinutes?: number;
  maxCandidates?: number;
}

export interface CandidateSlot {
  start: string; // ISO
  end: string; // ISO
  score: number; // 0..1, higher is better
  scoreBreakdown: {
    avgCircadianEnergy: number;
    deepWorkPreservationPenalty: number;
    requiredAttendeeCount: number;
  };
  rationale: string[];
}

export interface SchedulingResult {
  feasibleCandidates: CandidateSlot[];
  infeasibleReasonSummary: Record<string, number>; // reason -> count of slots rejected for it
  method: string[];
}

export function generateSchedulingSuggestions(req: SchedulingRequest): SchedulingResult {
  const granularity = req.candidateGranularityMinutes ?? 15;
  const maxCandidates = req.maxCandidates ?? 5;
  const method = [
    "Greedy discretized-grid search over the requested window (not a full CP/ILP solver) — see code comment for justification.",
    "Hard constraints (required-attendee availability, enforced no-meeting windows, local work-day bounds) filter candidates absolutely before any scoring.",
    "Soft score = average circadian energy across required attendees (literature-grounded heuristic, not a measured alertness value) minus a deep-work-fragmentation penalty.",
    "This function never books a meeting. It returns ranked suggestions only; a human must separately confirm one via the T2-gated confirmation action.",
  ];

  const requiredAttendees = req.attendees.filter((a) => a.required);
  const infeasibleReasonSummary: Record<string, number> = {};
  const candidates: CandidateSlot[] = [];

  for (
    let cursor = new Date(req.earliestStart);
    addMinutes(cursor, req.durationMinutes) <= req.latestEnd;
    cursor = addMinutes(cursor, granularity)
  ) {
    const slotStart = new Date(cursor);
    const slotEnd = addMinutes(slotStart, req.durationMinutes);

    const rejection = findHardConstraintViolation(slotStart, slotEnd, req.attendees, req.noMeetingWindows);
    if (rejection) {
      infeasibleReasonSummary[rejection] = (infeasibleReasonSummary[rejection] ?? 0) + 1;
      continue;
    }

    const { avgEnergy, rationale } = scoreCircadian(slotStart, requiredAttendees);
    const fragmentationPenalty = scoreFragmentationPenalty(slotStart, slotEnd, requiredAttendees);
    const score = clamp01(avgEnergy * 0.7 + (1 - fragmentationPenalty) * 0.3);

    candidates.push({
      start: slotStart.toISOString(),
      end: slotEnd.toISOString(),
      score: round2(score),
      scoreBreakdown: {
        avgCircadianEnergy: round2(avgEnergy),
        deepWorkPreservationPenalty: round2(fragmentationPenalty),
        requiredAttendeeCount: requiredAttendees.length,
      },
      rationale,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  return {
    feasibleCandidates: candidates.slice(0, maxCandidates),
    infeasibleReasonSummary,
    method,
  };
}

function findHardConstraintViolation(
  slotStart: Date,
  slotEnd: Date,
  attendees: AttendeeContext[],
  noMeetingWindows: NoMeetingWindowConstraint[],
): string | null {
  for (const a of attendees) {
    for (const busy of a.busy) {
      if (overlaps(slotStart, slotEnd, busy.start, busy.end)) {
        return a.required
          ? `Required attendee ${a.userId} is busy`
          : `Optional attendee ${a.userId} is busy`;
      }
    }

    const localStartMinute = localMinuteOfDay(a.timezone, slotStart);
    const localEndMinuteRaw = localStartMinute + (slotEnd.getTime() - slotStart.getTime()) / 60000;
    if (localStartMinute < a.workDayStartMinute || localEndMinuteRaw > a.workDayEndMinute) {
      if (a.required) return `Outside required attendee ${a.userId}'s local work day`;
    }

    const localDow = localDayOfWeek(a.timezone, slotStart);
    for (const w of noMeetingWindows) {
      if (!w.enforced) continue;
      if (w.appliesToUserId !== null && w.appliesToUserId !== a.userId) continue;
      if (w.dayOfWeek !== localDow) continue;
      const overlapsWindow = localStartMinute < w.endMinute && w.startMinute < localEndMinuteRaw;
      if (overlapsWindow && a.required) {
        return `Violates enforced no-meeting window for ${a.userId}`;
      }
    }
  }
  return null;
}

function scoreCircadian(
  slotStart: Date,
  requiredAttendees: AttendeeContext[],
): { avgEnergy: number; rationale: string[] } {
  if (requiredAttendees.length === 0) return { avgEnergy: 0.5, rationale: ["No required attendees — neutral energy score."] };
  let total = 0;
  const rationale: string[] = [];
  for (const a of requiredAttendees) {
    const localHour = localMinuteOfDay(a.timezone, slotStart) / 60;
    const energy = circadianEnergy(localHour, a.chronotype);
    total += energy;
  }
  const avg = total / requiredAttendees.length;
  rationale.push(
    `Average modeled circadian energy across ${requiredAttendees.length} required attendee(s) at their local time: ${avg.toFixed(2)} (0-1 scale, heuristic not measured).`,
  );
  return { avgEnergy: avg, rationale };
}

function scoreFragmentationPenalty(slotStart: Date, slotEnd: Date, requiredAttendees: AttendeeContext[]): number {
  if (requiredAttendees.length === 0) return 0;
  let totalPenalty = 0;
  for (const a of requiredAttendees) {
    const adjacentGapMinutes = Math.min(
      ...a.busy.map((b) => {
        const gapBefore = (slotStart.getTime() - b.end.getTime()) / 60000;
        const gapAfter = (b.start.getTime() - slotEnd.getTime()) / 60000;
        const candidates = [gapBefore, gapAfter].filter((g) => g >= 0);
        return candidates.length ? Math.min(...candidates) : Infinity;
      }),
      Infinity,
    );
    // An isolated slot deep inside a long open block preserves deep work
    // (low penalty); a slot that creates a small, unusable gap next to an
    // existing meeting fragments the day (higher penalty).
    if (Number.isFinite(adjacentGapMinutes) && adjacentGapMinutes > 0 && adjacentGapMinutes < 30) {
      totalPenalty += 1;
    }
  }
  return clamp01(totalPenalty / requiredAttendees.length);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
