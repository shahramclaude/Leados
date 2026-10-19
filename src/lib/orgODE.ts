// Organizational Physics ODE System — a 5-variable state vector
// (Engagement, Velocity, Trust, Capacity, Morale), hand-written derivatives,
// and RK4 numerical integration. This is the EXPENSIVE, full-fidelity
// simulation (12-week horizon, 4 derivative evaluations per week via RK4 =
// up to 48 derivative evaluations per call) — intentionally NOT called from
// the orchestrator's request-path pipeline (see fastOrgDynamics below for
// the version that is).
//
// Model structure loosely inspired by system-dynamics literature
// (Sterman, 2000, "Business Dynamics"); the specific coefficients are
// original, disclosed heuristics, not empirically fitted.

import type { PersonEvent } from "./flightRisk";

export type OrgState = { E: number; V: number; T: number; C: number; M: number };
export type Interventions = { oneOnOneImproved?: number; debtResolved?: number; conflictResolved?: number };

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}
function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

export const orgODE = {
  /** Builds the initial 5-variable state vector from the raw people event log. */
  buildStateVector(events: PersonEvent[], today: Date): OrgState {
    const pulses = events.filter((e) => e.type === "pulse.mood.logged" && daysBetween(today, toDate(e.occurredAt)) <= 30);
    const meanMood = pulses.length
      ? pulses.reduce((a, e) => a + Number(e.data.mood ?? 6), 0) / pulses.length
      : 6;

    const milestones = events.filter(
      (e) => e.type === "milestone.delivered" && daysBetween(today, toDate(e.occurredAt)) <= 60
    ).length;
    const V = Math.min(10, 4 + milestones * 0.5); // simple activity-based proxy, disclosed heuristic

    const conflictsLogged = events.filter((e) => e.type === "conflict.logged" && daysBetween(today, toDate(e.occurredAt)) <= 90).length;
    const conflictsResolved = events.filter((e) => e.type === "conflict.resolved" && daysBetween(today, toDate(e.occurredAt)) <= 90).length;
    const T = conflictsLogged ? Math.min(10, (conflictsResolved / conflictsLogged) * 10) : 7;

    const C = 7; // neutral capacity prior — disclosed simplification, no workload-forecasting engine wired in here

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

  integrate(
    events: PersonEvent[],
    today: Date,
    horizonWeeks = 12,
    interventions: Interventions = {},
    initialStateOverride?: OrgState
  ) {
    const dt = 1;
    let state = initialStateOverride ?? this.buildStateVector(events, today);
    const trajectory: (OrgState & { week: number })[] = [{ week: 0, ...state }];

    const keys: (keyof OrgState)[] = ["E", "V", "T", "C", "M"];
    const dKey: Record<keyof OrgState, string> = { E: "dE", V: "dV", T: "dT", C: "dC", M: "dM" };

    for (let week = 1; week <= horizonWeeks; week++) {
      const k1 = this.derivatives(state, interventions);
      const s2 = { ...state };
      keys.forEach((k) => (s2[k] = state[k] + (dt / 2) * (k1 as Record<string, number>)[dKey[k]]));
      const k2 = this.derivatives(s2, interventions);
      const s3 = { ...state };
      keys.forEach((k) => (s3[k] = state[k] + (dt / 2) * (k2 as Record<string, number>)[dKey[k]]));
      const k3 = this.derivatives(s3, interventions);
      const s4 = { ...state };
      keys.forEach((k) => (s4[k] = state[k] + dt * (k3 as Record<string, number>)[dKey[k]]));
      const k4 = this.derivatives(s4, interventions);

      const next = { ...state };
      keys.forEach((k) => {
        const d = dKey[k];
        const slope =
          ((k1 as Record<string, number>)[d] +
            2 * (k2 as Record<string, number>)[d] +
            2 * (k3 as Record<string, number>)[d] +
            (k4 as Record<string, number>)[d]) /
          6;
        next[k] = Math.max(0, Math.min(10, state[k] + dt * slope));
      });
      state = next;
      trajectory.push({ week, ...(Object.fromEntries(keys.map((k) => [k, Math.round(state[k] * 10) / 10])) as OrgState) });
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

// ---------------------------------------------------------------------------
// fastOrgDynamics — the lightweight version the orchestrator actually calls.
//
// Instead of a 12-week RK4 integration (up to 48 derivative evaluations),
// this takes exactly ONE explicit Euler step (dt = 1) of the same dE
// differential structure used in `derivatives()` above, vectorized across
// the whole roster instead of one scalar engagement value, plus O(V+E)
// graph-degree bookkeeping for cohesion/isolation. No iteration, no
// recursion, no RK4 sub-steps.
//
// COMPLEXITY: O(V + E)
//   - one pass over `people`            -> O(V)   (risk mean/variance)
//   - one pass over `edges`             -> O(E)   (degree map, density)
//   - one constant-time Euler update    -> O(1)
//   total: O(V + E), no nested loops over people or edges.
// For the stated bound (V <= 100, and E <= V*(V-1)/2 <= ~4950 in the
// pathological complete-graph case, realistically E << V for an org chart),
// this is a few thousand primitive arithmetic ops — sub-millisecond in
// Node, comfortably inside the 500ms budget for 50 people.
// ---------------------------------------------------------------------------

export interface FastDynamicsPerson {
  id: number;
  flightRiskScore: number; // 0-1
  burnoutRiskScore: number; // 0-1
}

export interface FastDynamicsEdge {
  a: number;
  b: number;
  weight: number;
}

export interface FastOrgDynamicsResult {
  /** One-Euler-step delta of the network "disorder" proxy. Positive = destabilizing. */
  entropyTrend: number;
  /** 0-100, derived from graph density (edges / possible edges). */
  cohesionScore: number;
  isolationRisk: { id: number; connections: number }[];
}

function clamp01to100(v: number): number {
  return Math.max(0, Math.min(100, v));
}

export function fastOrgDynamics(people: FastDynamicsPerson[], edges: FastDynamicsEdge[]): FastOrgDynamicsResult {
  const n = people.length || 1;

  // --- O(V): risk mean + variance -> "current entropy" proxy ---
  let sumRisk = 0;
  let sumRiskSq = 0;
  for (const p of people) {
    const risk = (p.flightRiskScore + p.burnoutRiskScore) / 2;
    sumRisk += risk;
    sumRiskSq += risk * risk;
  }
  const meanRisk = sumRisk / n;
  const variance = Math.max(0, sumRiskSq / n - meanRisk * meanRisk);
  const stdev = Math.sqrt(variance);
  // OWN DERIVATION: risk values live in [0,1], so stdev is bounded by 0.5;
  // scale by 200 so a maximally-polarized team (half at 0, half at 1) reads 100.
  const currentEntropy = clamp01to100(stdev * 200);

  // --- O(E): degree map for cohesion + isolation risk ---
  const degree = new Map<number, number>();
  people.forEach((p) => degree.set(p.id, 0));
  for (const e of edges) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }
  const maxPossibleEdges = Math.max(1, (n * (n - 1)) / 2);
  const density = edges.length / maxPossibleEdges;
  const cohesionScore = Math.round(clamp01to100(density * 100));

  const isolationRisk = people
    .map((p) => ({ id: p.id, connections: degree.get(p.id) ?? 0 }))
    .filter((d) => d.connections < 2);

  // --- O(1): single explicit Euler step of orgODE.derivatives()'s dE form ---
  // Source: orgODE.derivatives(): dE = (T - E)*0.1 + (C - E)*0.05 + ...
  // Here the "target" T is a cohesion-adjusted healthy-disorder baseline
  // (more cohesive network -> lower expected disorder) and C is the same
  // neutral capacity prior (7/10 -> 70/100) used in buildStateVector above.
  const targetEntropy = clamp01to100(30 - cohesionScore * 0.2);
  const capacityPrior = 70;
  const isolationPenalty = (isolationRisk.length / n) * 10;
  const dt = 1;
  const dE = (targetEntropy - currentEntropy) * 0.1 + (capacityPrior - currentEntropy) * 0.05 - isolationPenalty;
  const entropyTrend = Math.round(dE * dt * 10) / 10;

  return { entropyTrend, cohesionScore, isolationRisk };
}
