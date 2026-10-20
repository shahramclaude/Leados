// A small system-dynamics engine: a coupled ODE pair for team morale and
// delivery velocity, integrated with the forward Euler method. This is the
// "orgODE" math engine named in the Part 11 brief — simple by design, pure,
// and deterministic, so it can be property-tested like the other engines.
//
//   dM/dt = a * (targetMorale - M) + b * V      (morale drifts toward a
//                                                 target, nudged by velocity)
//   dV/dt = c * M - d * V                        (velocity is driven by
//                                                 morale and decays over time)

export interface OrgState {
  morale: number;
  velocity: number;
}

export interface OrgParams {
  a: number;
  b: number;
  c: number;
  d: number;
  targetMorale: number;
}

export function stepOrgState(state: OrgState, params: OrgParams, dt: number): OrgState {
  const { a, b, c, d, targetMorale } = params;
  const dMorale = a * (targetMorale - state.morale) + b * state.velocity;
  const dVelocity = c * state.morale - d * state.velocity;
  return {
    morale: state.morale + dMorale * dt,
    velocity: state.velocity + dVelocity * dt,
  };
}

/** Returns `steps + 1` states: the initial state followed by one per step. */
export function simulateOrgDynamics(
  initial: OrgState,
  params: OrgParams,
  steps: number,
  dt: number,
): OrgState[] {
  if (steps < 0) throw new Error("steps must not be negative");
  if (dt <= 0) throw new Error("dt must be positive");

  const trajectory: OrgState[] = [initial];
  let current = initial;
  for (let i = 0; i < steps; i++) {
    current = stepOrgState(current, params, dt);
    trajectory.push(current);
  }
  return trajectory;
}
