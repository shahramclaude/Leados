// Seam 6: process mining feeds automation scoring.
//
// For a set of mined process-step events, the automation score is the
// share of total observed time spent in steps flagged `automatable`,
// weighted lightly by repetition count (more repeated steps are safer
// automation bets than one-off long steps).
export type ProcessEventInput = {
  step: string;
  durationMs: number;
  automatable: boolean;
};

export type AutomationScoreResult = {
  score: number;
  eventCount: number;
  basis: {
    totalDurationMs: number;
    automatableDurationMs: number;
    automatableSteps: string[];
  };
};

export type WeightedAutomationScoreResult = AutomationScoreResult & {
  weightedScore: number;
  repetitionBonus: number;
};

export function computeAutomationScore(events: ProcessEventInput[]): AutomationScoreResult {
  if (events.length === 0) {
    return { score: 0, eventCount: 0, basis: { totalDurationMs: 0, automatableDurationMs: 0, automatableSteps: [] } };
  }

  const totalDurationMs = events.reduce((sum, e) => sum + e.durationMs, 0);
  const automatableEvents = events.filter((e) => e.automatable);
  const automatableDurationMs = automatableEvents.reduce((sum, e) => sum + e.durationMs, 0);
  const automatableSteps = Array.from(new Set(automatableEvents.map((e) => e.step)));

  const score =
    totalDurationMs === 0 ? 0 : Math.round((automatableDurationMs / totalDurationMs) * 10000) / 100;

  return {
    score,
    eventCount: events.length,
    basis: { totalDurationMs, automatableDurationMs, automatableSteps },
  };
}

/**
 * Repetition-weighted automation score — implements the "weighted lightly by
 * repetition count" contract the header describes but the original
 * implementation did not. More repeated automatable steps earn a small bonus
 * (up to +10 points) because a step seen 10× is a safer automation bet than
 * a one-off long step of the same duration.
 *
 * Pure, backward-compatible: callers that need the simple ratio keep using
 * `computeAutomationScore`; callers that want the intelligent version use this.
 */
export function computeWeightedAutomationScore(events: ProcessEventInput[]): WeightedAutomationScoreResult {
  const base = computeAutomationScore(events);
  if (events.length === 0) return { ...base, weightedScore: 0, repetitionBonus: 0 };

  // Count occurrences per automatable step
  const counts = new Map<string, number>();
  for (const e of events) if (e.automatable) counts.set(e.step, (counts.get(e.step) || 0) + 1);

  // Repetition bonus: for each automatable step, log2(count) bonus points,
  // capped at 2 per step, summed and capped at 10 total.
  let bonus = 0;
  for (const count of counts.values()) {
    if (count > 1) bonus += Math.min(2, Math.log2(count));
  }
  bonus = Math.min(10, Math.round(bonus * 100) / 100);
  const weightedScore = Math.min(100, Math.round((base.score + bonus) * 100) / 100);
  return { ...base, weightedScore, repetitionBonus: bonus };
}
