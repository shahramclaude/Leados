// LEADOS — Part 25 "ritual engine" dependency stand-in
//
// Honesty note (see temporal.ts header): the real Part 25 ritual/capture
// engine and cadence-adaptation logic were not present in this checkout.
// This stand-in implements the narrow surface Part 45 needs:
//   1) reading captured decisions/actions per meeting instance
//      (`te_meeting_outcomes`, written by whatever upstream capture tool —
//      Part 25 — produces them; this module is just the typed accessor),
//   2) a cadence-adaptation suggestion function so the "no-meeting window"
//      and "kill/shrink recurring meeting" flows have something concrete
//      to call, matching the described Part 25 contract.
//
// This does NOT re-implement Part 25's NLP/transcript capture. It assumes
// `decisionsCount`/`actionsCount` are already populated by that system (or,
// in this sandbox, by the seed script for demonstration/testing).

export interface MeetingOutcomeRecord {
  eventId: string;
  decisionsCount: number;
  actionsCount: number;
  occurredAt: Date;
}

export type CadenceSuggestion =
  | { action: "keep"; reason: string }
  | { action: "shorten"; targetMinutes: number; reason: string }
  | { action: "convert_async"; reason: string }
  | { action: "reduce_frequency"; from: string; to: string; reason: string }
  | { action: "kill"; reason: string };

/**
 * Suggests a cadence change for a recurring meeting given its recent
 * outcome history. This mirrors Part 25's "cadence adaptation" concept:
 * rituals that stop producing outcomes should shrink, go async, or die.
 */
export function suggestCadenceChange(
  recentOutcomes: MeetingOutcomeRecord[],
  zeroOutcomeWeeksThreshold: number,
  durationMinutes: number,
): CadenceSuggestion {
  if (recentOutcomes.length === 0) {
    return { action: "keep", reason: "No outcome history yet — insufficient data to recommend a change." };
  }

  const sorted = [...recentOutcomes].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const trailing = sorted.slice(-zeroOutcomeWeeksThreshold);
  const zeroStreak = trailing.every((o) => o.decisionsCount + o.actionsCount === 0);

  if (zeroStreak && trailing.length >= zeroOutcomeWeeksThreshold) {
    return {
      action: "kill",
      reason: `Zero decisions and zero actions captured across the last ${trailing.length} occurrences (>= ${zeroOutcomeWeeksThreshold}-week threshold). Candidate for retirement or async-convert.`,
    };
  }

  const avgOutcomesPerHour =
    sorted.reduce((acc, o) => acc + o.decisionsCount + o.actionsCount, 0) /
    sorted.length /
    (durationMinutes / 60);

  if (avgOutcomesPerHour < 1 && durationMinutes > 30) {
    return {
      action: "shorten",
      targetMinutes: Math.max(15, Math.round(durationMinutes * 0.5)),
      reason: `Average outcome density (${avgOutcomesPerHour.toFixed(2)}/hr) is low relative to duration; a shorter slot likely captures the same outcomes.`,
    };
  }

  if (avgOutcomesPerHour < 2 && durationMinutes >= 30) {
    return {
      action: "convert_async",
      reason: `Outcome density (${avgOutcomesPerHour.toFixed(2)}/hr) suggests this could be a status update handled via async capture instead of synchronous time.`,
    };
  }

  return { action: "keep", reason: `Healthy outcome density (${avgOutcomesPerHour.toFixed(2)}/hr).` };
}
