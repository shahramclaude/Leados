// Organizational Physics ODE System — original TypeScript implementing the
// functional ideas in the task's pasted "Part 8" brief (5-variable state vector,
// hand-written derivatives, RK4 numerical integration). Unverified external
// spec — no ODE/physics engine of this kind was found in the real repo (the
// repo does have an unrelated orphaned src/lib/physics.ts, not read in full
// this session — not claimed as a match, see AI-SESSION-LOG.md).
import type { AppState } from "./types";
import { daysBetween } from "./store";

export type OrgState = { E: number; V: number; T: number; C: number; M: number };
export type Interventions = { oneOnOneImproved?: number; debtResolved?: number; conflictResolved?: number };

export const orgODE = {
  buildStateVector(P: AppState, today: Date): OrgState {
    const pulses = P.events.filter((e) => e.type === "pulse.recorded" && daysBetween(e.ts, today) <= 30);
    const meanMood = pulses.length ? pulses.reduce((a, e) => a + e.data.mood, 0) / pulses.length : 6;

    const deals = P.events.filter((e) => e.type === "sales.deal.closed" && daysBetween(e.ts, today) <= 60).length;
    const V = Math.min(10, 4 + deals * 0.5); // simple activity-based proxy, disclosed heuristic

    const conflictsLogged = P.events.filter((e) => e.type === "conflict.logged" && daysBetween(e.ts, today) <= 90).length;
    const conflictsResolved = P.events.filter((e) => e.type === "conflict.resolved" && daysBetween(e.ts, today) <= 90).length;
    const T = conflictsLogged ? Math.min(10, (conflictsResolved / conflictsLogged) * 10) : 7;

    const C = 7; // neutral capacity prior — no sev-5 findings engine wired into this module (disclosed simplification)

    return { E: meanMood, V, T, C, M: 5 };
  },

  derivatives(state: OrgState, interventions: Interventions = {}) {
    const { E, V, T, C } = state;
    const { oneOnOneImproved = 0, debtResolved = 0, conflictResolved = 0 } = interventions;

    const dE = (T - E) * 0.1 + (C - E) * 0.05 + oneOnOneImproved * 0.3 - Math.max(0, E - 8) * 0.2;
    const dV = (E - V) * 0.15 + debtResolved * 0.4 - Math.max(0, V - C) * 0.3;
    const dT = conflictResolved * 0.2 + (V - 5) * 0.05 - Math.max(0, 5 - E) * 0.1;
    const dC = -(V - 5) * 0.1 - Math.max(0, 8 - T) * 0.05;
    const dM = (dE + dV) / 2;

    return { dE, dV, dT, dC, dM };
  },

  integrate(P: AppState, today: Date, horizonWeeks = 12, interventions: Interventions = {}, initialStateOverride?: OrgState) {
    const dt = 1;
    let state = initialStateOverride ?? this.buildStateVector(P, today);
    const trajectory: (OrgState & { week: number })[] = [{ week: 0, ...state }];

    const keys: (keyof OrgState)[] = ["E", "V", "T", "C", "M"];
    const dKey: Record<keyof OrgState, string> = { E: "dE", V: "dV", T: "dT", C: "dC", M: "dM" };

    for (let week = 1; week <= horizonWeeks; week++) {
      const k1 = this.derivatives(state, interventions);
      const s2 = { ...state };
      keys.forEach((k) => (s2[k] = state[k] + (dt / 2) * (k1 as any)[dKey[k]]));
      const k2 = this.derivatives(s2, interventions);
      const s3 = { ...state };
      keys.forEach((k) => (s3[k] = state[k] + (dt / 2) * (k2 as any)[dKey[k]]));
      const k3 = this.derivatives(s3, interventions);
      const s4 = { ...state };
      keys.forEach((k) => (s4[k] = state[k] + dt * (k3 as any)[dKey[k]]));
      const k4 = this.derivatives(s4, interventions);

      const next = { ...state };
      keys.forEach((k) => {
        const d = dKey[k];
        const slope = ((k1 as any)[d] + 2 * (k2 as any)[d] + 2 * (k3 as any)[d] + (k4 as any)[d]) / 6;
        next[k] = Math.max(0, Math.min(10, state[k] + dt * slope));
      });
      state = next;
      trajectory.push({ week, ...Object.fromEntries(keys.map((k) => [k, Math.round(state[k] * 10) / 10])) } as any);
    }

    return {
      trajectory,
      finalState: state,
      attractorPrediction: this._predictAttractor(trajectory),
      label:
        `Organizational physics ODE integration. Method: Runge-Kutta 4th order, dt=1 week, horizon=${horizonWeeks} weeks. ` +
        `Model structure loosely inspired by system-dynamics literature (Sterman, 2000). ` +
        `Labeled: parameters are illustrative heuristics, not empirically validated.`,
    };
  },

  _predictAttractor(trajectory: (OrgState & { week: number })[]) {
    const last3 = trajectory.slice(-3);
    const stable = last3.length === 3 && last3.every((s) => Math.abs(s.E - last3[0].E) < 0.2);
    if (!stable) return { type: "OSCILLATING", description: "No stable equilibrium reached within horizon." };

    const finalE = last3[last3.length - 1].E;
    const finalV = last3[last3.length - 1].V;
    if (finalE > 7 && finalV > 7) return { type: "HIGH_PERFORMANCE", description: "Converges to high-engagement, high-velocity state." };
    if (finalE < 4 || finalV < 4) return { type: "DECLINE", description: "Converges to low-engagement/low-velocity state — intervention recommended." };
    return { type: "STABLE", description: `Stabilizes at engagement≈${finalE}, velocity≈${finalV}.` };
  },
};
