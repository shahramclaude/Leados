/**
 * Hysteresis controller for status transitions (e.g. finding "cold" -> "hot").
 *
 * A naive threshold ("hot if score >= 0.5") oscillates when the score
 * hovers around the boundary. Hysteresis uses two thresholds: the score must
 * rise above `enterAbove` to switch cold -> hot, and must fall below
 * `exitBelow` (< enterAbove) to switch hot -> cold. Pure function of
 * (previous state, score) — no randomness, no time — so non-oscillation is a
 * provable, property-testable invariant.
 */
export type HysteresisState = "cold" | "hot";

export type HysteresisConfig = {
  enterAbove: number; // score must exceed this to go cold -> hot
  exitBelow: number; // score must drop below this to go hot -> cold
};

export function createHysteresisConfig(enterAbove: number, exitBelow: number): HysteresisConfig {
  if (!(exitBelow < enterAbove)) {
    throw new Error("exitBelow must be strictly less than enterAbove to avoid oscillation");
  }
  return { enterAbove, exitBelow };
}

export function hysteresisStep(
  config: HysteresisConfig,
  previous: HysteresisState,
  score: number,
): HysteresisState {
  if (previous === "cold") {
    return score > config.enterAbove ? "hot" : "cold";
  }
  return score < config.exitBelow ? "cold" : "hot";
}

/** Runs a full score sequence through the controller, returning the state trace. */
export function hysteresisTrace(
  config: HysteresisConfig,
  initial: HysteresisState,
  scores: readonly number[],
): HysteresisState[] {
  const trace: HysteresisState[] = [];
  let state = initial;
  for (const score of scores) {
    state = hysteresisStep(config, state, score);
    trace.push(state);
  }
  return trace;
}

/**
 * Counts transitions in a trace. Used by tests to assert that a score
 * sequence confined to the dead band (exitBelow, enterAbove) never produces
 * more transitions than a naive single-threshold controller would.
 */
export function countTransitions(trace: readonly HysteresisState[]): number {
  let transitions = 0;
  for (let i = 1; i < trace.length; i += 1) {
    if (trace[i] !== trace[i - 1]) transitions += 1;
  }
  return transitions;
}
