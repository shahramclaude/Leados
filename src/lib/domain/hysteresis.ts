/**
 * Schmitt-trigger style hysteresis gate.
 *
 * Used to turn a noisy continuous signal (e.g. a risk score, a fairness
 * metric, a utilization percentage) into a stable binary state
 * ("alert" / "ok") without chattering when the signal hovers near a single
 * threshold. Requires `onThreshold > offThreshold` for an "alert when high"
 * gate (or `onThreshold < offThreshold` for an "alert when low" gate).
 */

export type GateState = "on" | "off";

export interface HysteresisConfig {
  /** Value at/above which the gate turns ON (for a high-alert gate). */
  readonly onThreshold: number;
  /** Value at/below which the gate turns OFF (for a high-alert gate). */
  readonly offThreshold: number;
}

export interface HysteresisGate {
  readonly state: GateState;
  readonly config: HysteresisConfig;
}

export function createHysteresisGate(
  config: HysteresisConfig,
  initial: GateState = "off",
): HysteresisGate {
  validateConfig(config);
  return { state: initial, config };
}

function validateConfig(config: HysteresisConfig): void {
  if (config.onThreshold <= config.offThreshold) {
    throw new Error(
      "onThreshold must be strictly greater than offThreshold to avoid oscillation",
    );
  }
}

/**
 * Feed one new sample through the gate. Pure function — returns a new gate,
 * never mutates. The core correctness property is: once `off`, the value
 * must reach `onThreshold` to flip `on`; once `on`, the value must fall to
 * `offThreshold` to flip `off`. Any value strictly between the thresholds
 * leaves the state unchanged ("the dead band").
 */
export function stepHysteresis(gate: HysteresisGate, value: number): HysteresisGate {
  const { onThreshold, offThreshold } = gate.config;
  if (gate.state === "off" && value >= onThreshold) {
    return { ...gate, state: "on" };
  }
  if (gate.state === "on" && value <= offThreshold) {
    return { ...gate, state: "off" };
  }
  return gate;
}

/** Convenience: fold a whole series through the gate, returning final state. */
export function runHysteresis(
  gate: HysteresisGate,
  values: readonly number[],
): HysteresisGate {
  return values.reduce(stepHysteresis, gate);
}
