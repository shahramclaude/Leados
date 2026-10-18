// Synthetic data generators for the pt-S demo. Original to this delivery —
// no equivalent seed/mood-scenario generator was found in the real repo's
// verified files this session (only its existence as `src/lib/seed.ts` was
// confirmed by filename in the tree listing; its contents were not fetched,
// so no claim is made about what it contains there).
import type { MoodScenario } from "./types";

// Deterministic mood series (8 pulses, roughly weekly, on a 1-5 scale) per scenario.
export const MOOD_SERIES: Record<MoodScenario, number[]> = {
  declining: [4.2, 4.0, 3.8, 3.6, 3.3, 3.0, 2.7, 2.4],
  stable: [3.6, 3.7, 3.5, 3.6, 3.6, 3.5, 3.7, 3.6],
  improving: [2.6, 2.8, 3.0, 3.2, 3.4, 3.6, 3.8, 4.0],
};

// Deterministic synthetic goal/OKR ledger: [achieved, achieved, missed, ...]
// goalHitRate = achieved / total.
export const SYNTHETIC_GOAL_LEDGER = [true, true, true, false, true, false, true, true, false, true];

export function syntheticGoalHitRate(): number {
  const hits = SYNTHETIC_GOAL_LEDGER.filter(Boolean).length;
  return hits / SYNTHETIC_GOAL_LEDGER.length;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
