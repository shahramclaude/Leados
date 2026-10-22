import { mulberry32, type RNG } from "../core/rng";
import { createTwin, stepTwin } from "../twin/twinEngine";
import type { TwinState } from "../twin/types";
import type { Scenario } from "../scenarios/types";
import { getRole, type RoleDefinition, type RoleId } from "./roles";

export class RoleScopeViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoleScopeViolation";
  }
}

export interface ScopedView {
  roleId: RoleId;
  turn: number;
  visibleMetrics: Record<string, number>;
  visibleAssumptionIds: string[];
}

/** Build the slice of state a role is permitted to see — no role gets the full twin state. */
export function getScopedView(role: RoleDefinition, state: TwinState, scenario: Scenario, turn: number): ScopedView {
  const visibleMetrics: Record<string, number> = {};
  for (const key of role.knowledgeScope) {
    if (key in state.metrics) visibleMetrics[key] = state.metrics[key];
  }
  const visibleAssumptionIds = scenario.macroAssumptions.filter((a) => role.knowledgeScope.includes(a.id)).map((a) => a.id);
  return { roleId: role.id, turn, visibleMetrics, visibleAssumptionIds };
}

/** Guarded read: throws RoleScopeViolation rather than silently returning out-of-scope data. */
export function readScopedField(view: ScopedView, key: string): number {
  if (!(key in view.visibleMetrics)) {
    throw new RoleScopeViolation(`Role "${view.roleId}" attempted to read out-of-scope field "${key}" on turn ${view.turn}.`);
  }
  return view.visibleMetrics[key];
}

export interface RoleMove {
  roleId: RoleId;
  turn: number;
  action: string;
  parameterDeltas: Record<string, number>;
  rationale: string;
}

export type RolePlayer = (view: ScopedView, rng: RNG) => RoleMove;

/**
 * Rule-based role players, constrained to each role's scoped view only.
 *
 * PROVENANCE NOTE: Part 11's AI-role-player infrastructure is not present
 * in this sandbox snapshot. These are deterministic rule-based stand-ins —
 * honestly labeled as such — that satisfy the same contract (a function of
 * a scoped view and an rng stream, never the full twin state). Swap in
 * Part 11's AI players by implementing the same `RolePlayer` signature.
 */
export const DEFAULT_ROLE_PLAYERS: Record<RoleId, RolePlayer> = {
  us: (view, rng) => {
    const cash = view.visibleMetrics.cashRunwayMonths ?? 18;
    const churn = view.visibleMetrics.churnRate ?? 0.08;
    if (cash < 12) {
      return { roleId: "us", turn: view.turn, action: "Cut burn", parameterDeltas: { headcount: -1, cashRunwayMonths: 1.5 }, rationale: `Cash runway (${cash.toFixed(1)}mo) below 12-month guardrail.` };
    }
    if (churn > 0.1) {
      return { roleId: "us", turn: view.turn, action: "Invest in retention", parameterDeltas: { churnRate: -0.012, revenueGrowth: -0.004 }, rationale: `Churn (${(churn * 100).toFixed(1)}%) above 10% threshold.` };
    }
    const growthBet = rng() > 0.5;
    return growthBet
      ? { roleId: "us", turn: view.turn, action: "Invest in growth", parameterDeltas: { revenueGrowth: 0.012, cashRunwayMonths: -0.5 }, rationale: "Cash and churn healthy; pressing growth." }
      : { roleId: "us", turn: view.turn, action: "Hold steady", parameterDeltas: {} as Record<string, number>, rationale: "Cash and churn healthy; consolidating gains before next bet." };
  },
  competitorA: (view, rng) => {
    const ourShare = view.visibleMetrics.marketShare ?? 0;
    const aggression = view.visibleMetrics.competitorAggression ?? 0.3;
    if (ourShare > 0.05 && aggression < 0.5 && rng() > 0.3) {
      return { roleId: "competitorA", turn: view.turn, action: "Launch aggressive pricing", parameterDeltas: { competitorAggression: 0.06 }, rationale: "Target share is attractive and our own aggression has headroom." };
    }
    return { roleId: "competitorA", turn: view.turn, action: "Hold position", parameterDeltas: {} as Record<string, number>, rationale: "No clear opening this turn." };
  },
  regulator: (view, rng) => {
    const pressure = view.visibleMetrics.regulatoryPressure ?? 0.2;
    if (pressure < 0.4 && view.turn >= 3 && rng() > 0.5) {
      return { roleId: "regulator", turn: view.turn, action: "Issue draft guidance", parameterDeltas: { regulatoryPressure: 0.04 }, rationale: "Pressure has stayed below threshold for several turns; time to act." };
    }
    return { roleId: "regulator", turn: view.turn, action: "Monitor", parameterDeltas: {} as Record<string, number>, rationale: "Insufficient grounds to escalate this turn." };
  },
  keyCustomer: (view) => {
    const churn = view.visibleMetrics.churnRate ?? 0.08;
    if (churn > 0.12) {
      return { roleId: "keyCustomer", turn: view.turn, action: "Open renegotiation", parameterDeltas: {} as Record<string, number>, rationale: "Perceived reliability risk is rising; seeking better terms." };
    }
    return { roleId: "keyCustomer", turn: view.turn, action: "Renew as-is", parameterDeltas: {} as Record<string, number>, rationale: "No reliability concerns this turn." };
  },
  talentMarket: (view, rng) => {
    const availability = view.visibleMetrics.talentAvailability ?? 0.6;
    if (availability < 0.5 && rng() > 0.4) {
      return { roleId: "talentMarket", turn: view.turn, action: "Tighten supply further", parameterDeltas: { talentAvailability: -0.015 }, rationale: "Scarce specialists have options elsewhere." };
    }
    return { roleId: "talentMarket", turn: view.turn, action: "Supply steady", parameterDeltas: {} as Record<string, number>, rationale: "No material shift in specialist availability." };
  },
};

export interface WarGameEvent {
  turn: number;
  phase: "observe" | "decide" | "act" | "resolve";
  roleId: RoleId | "system";
  description: string;
  payload?: Record<string, unknown>;
  timestamp: string;
}

export interface WarGameResult {
  scenarioId: string;
  seed: number;
  turns: number;
  events: WarGameEvent[];
  trace: TwinState[];
  movesByRole: Record<RoleId, RoleMove[]>;
}

/**
 * Deterministic turn-based war-game: observe -> decide -> act -> resolve,
 * resolved each turn via a seeded twin step. Roles only ever see their
 * scoped view (`getScopedView`); the engine itself still applies the
 * scenario's own macro shocks, which are not role moves.
 */
export function runWarGame(
  scenario: Scenario,
  roleIds: RoleId[],
  turns: number,
  seed: number,
  players: Record<RoleId, RolePlayer> = DEFAULT_ROLE_PLAYERS
): WarGameResult {
  const roles = roleIds.map(getRole);
  const events: WarGameEvent[] = [];
  const movesByRole = {} as Record<RoleId, RoleMove[]>;
  for (const r of roleIds) movesByRole[r] = [];
  const trace: TwinState[] = [createTwin(scenario.twinConfig)];
  const shocksByTick = new Map<number, Record<string, number>>();
  for (const shock of scenario.shocks) {
    shocksByTick.set(shock.appliesAtTick, { ...(shocksByTick.get(shock.appliesAtTick) ?? {}), ...shock.parameterDeltas });
  }

  const now = () => new Date().toISOString();

  for (let t = 1; t <= turns; t++) {
    const prevState = trace[trace.length - 1];
    const turnRng = mulberry32((seed ^ (t * 2654435761)) >>> 0);
    const turnDeltas: Record<string, number> = {};

    for (const role of roles) {
      const view = getScopedView(role, prevState, scenario, t);
      events.push({ turn: t, phase: "observe", roleId: role.id, description: `${role.label} observed ${Object.keys(view.visibleMetrics).length} scoped metric(s).`, payload: { visibleMetrics: view.visibleMetrics }, timestamp: now() });

      const move = players[role.id](view, turnRng);
      movesByRole[role.id].push(move);
      events.push({ turn: t, phase: "decide", roleId: role.id, description: `${role.label} decided: ${move.action}. ${move.rationale}`, payload: { move }, timestamp: now() });

      if (Object.keys(move.parameterDeltas).length > 0) {
        events.push({ turn: t, phase: "act", roleId: role.id, description: `${role.label} acted: ${move.action}.`, payload: { parameterDeltas: move.parameterDeltas }, timestamp: now() });
        for (const [k, v] of Object.entries(move.parameterDeltas)) turnDeltas[k] = (turnDeltas[k] ?? 0) + v;
      }
    }

    const shockDeltas = shocksByTick.get(t);
    if (shockDeltas) {
      for (const [k, v] of Object.entries(shockDeltas)) turnDeltas[k] = (turnDeltas[k] ?? 0) + v;
      events.push({ turn: t, phase: "act", roleId: "system", description: `Scenario shock(s) applied: ${scenario.shocks.filter((s) => s.appliesAtTick === t).map((s) => s.label).join(", ")}`, payload: { shockDeltas }, timestamp: now() });
    }

    const nextState = stepTwin(prevState, scenario.twinConfig, { deltas: Object.keys(turnDeltas).length ? turnDeltas : undefined, note: `turn ${t} resolved` });
    trace.push(nextState);
    events.push({ turn: t, phase: "resolve", roleId: "system", description: `Turn ${t} resolved via twin step.`, payload: { metrics: nextState.metrics }, timestamp: now() });
  }

  return { scenarioId: scenario.id, seed, turns, events, trace, movesByRole };
}
