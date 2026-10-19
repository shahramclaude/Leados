// src/lib/intelligence/simulation.ts
//
// Generic ODE integration used by orgODE.ts. We use the classic 4th-order
// Runge-Kutta method (RK4): a standard, well-understood numerical scheme
// that is far more accurate than Euler's method for the same step size,
// without requiring a stiff-equation solver (our org-dynamics systems are
// smooth and non-stiff at weekly resolution).
export type StateVector = number[];
export type Derivative = (t: number, state: StateVector) => StateVector;

export interface IntegrationResult {
  times: number[];
  states: StateVector[];
}

function addScaled(a: StateVector, b: StateVector, scale: number): StateVector {
  return a.map((v, i) => v + b[i] * scale);
}

/** Integrates dState/dt = derivative(t, state) from t0 to t0+steps*dt using
 * RK4, returning the full trajectory (one entry per step, inclusive of the
 * initial state). */
export function integrateRK4(
  derivative: Derivative,
  initialState: StateVector,
  t0: number,
  dt: number,
  steps: number,
): IntegrationResult {
  const times = [t0];
  const states = [initialState];
  let state = initialState;
  let t = t0;
  for (let i = 0; i < steps; i++) {
    const k1 = derivative(t, state);
    const k2 = derivative(t + dt / 2, addScaled(state, k1, dt / 2));
    const k3 = derivative(t + dt / 2, addScaled(state, k2, dt / 2));
    const k4 = derivative(t + dt, addScaled(state, k3, dt));
    const next = state.map((v, idx) => v + (dt / 6) * (k1[idx] + 2 * k2[idx] + 2 * k3[idx] + k4[idx]));
    t += dt;
    state = next;
    times.push(t);
    states.push(state);
  }
  return { times, states };
}
