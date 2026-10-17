// Shared types for the LeadOS-Lite decision support app.
// ORIGINAL to this build — not copied from any external source.

export type EventType =
  | "decision.logged"
  | "bio.energy.logged"
  | "bio.fatigue.noted"
  | "simulation.run"
  | "a11y.profile.changed";

export interface AppEvent<T = Record<string, unknown>> {
  id: string;
  type: EventType;
  ts: string; // ISO timestamp
  payload: T;
}

export type CircadianPhase =
  | "MORNING_PEAK"
  | "MIDDAY_STEADY"
  | "POST_LUNCH_DIP"
  | "AFTERNOON_RECOVERY"
  | "EVENING_WIND_DOWN"
  | "SLEEP_PREPARATION"
  | "LOW_ALERTNESS_NIGHT";

export interface CircadianProfile {
  phase: CircadianPhase;
  label: string;
  analytical: number; // 0..1 relative capacity heuristic
  workingMemory: number; // 0..1
  note: string;
}

export interface Scenario {
  id: string;
  label: string;
  probability: number; // 0..1, should sum to 1 across a decision's scenarios
  impact: number; // signed value, e.g. revenue delta in $k
  spread: number; // +/- variability applied as uniform noise around impact
}

export interface Decision {
  id: string;
  title: string;
  type: DecisionType;
  createdAt: string;
  scenarios: Scenario[];
}

export type DecisionType =
  | "hire"
  | "termination-prep"
  | "strategy.decision"
  | "vendor"
  | "budget"
  | "other";

export interface MonteCarloResult {
  iterations: number;
  seed: number;
  mean: number;
  median: number;
  p10: number;
  p90: number;
  probPositive: number;
  histogram: { bucket: string; pct: number }[];
  computedVia: "worker" | "main-thread-fallback";
  ms: number;
}
