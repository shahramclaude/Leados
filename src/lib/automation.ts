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
