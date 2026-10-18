// localStorage persistence for the pt-S Bayesian demo. Original to this
// delivery. New storage key (STORAGE_KEY in types.ts) — this workspace began
// from the default Vite scaffold with no prior app state, so no continuity
// with any other session's key is claimed.
import type { AppState } from "./types";
import { STORAGE_KEY } from "./types";
import { syntheticGoalHitRate } from "./seed";

export function defaultState(): AppState {
  return {
    ruleFlags: {
      R1: true,
      R6: false,
      R7: true,
      R10: false,
      R14: true,
      R73: true,
      R104: false,
      R157: true,
    },
    moodScenario: "declining",
    goalHitRateMode: "synthetic",
    goalHitRateManual: syntheticGoalHitRate(),
    manualEvidence: {
      "comp.at_market": false,
      "promotion.recent": false,
      "pipeline.shrinking": true,
      "nps.high": false,
      "velocity.stable": false,
    },
    lastComputedAt: null,
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

export function saveState(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable (e.g. private mode) — fail silently, state stays in-memory.
  }
}

export function resetState(): AppState {
  const s = defaultState();
  saveState(s);
  return s;
}
