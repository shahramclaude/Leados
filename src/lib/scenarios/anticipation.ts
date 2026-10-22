import type { HorizonSignal } from "../signals/horizonSignal";
import type { Scenario } from "./types";

export interface AnticipationRecord {
  signalId: string;
  scenarioId: string;
  firstObservedAt: string;
  scenarioAuthoredAt: string;
  leadTimeDays: number;
}

/**
 * How much runway did we buy ourselves? The lead time between when a
 * horizon signal was first observed and when a scenario built on it was
 * authored. This is a *process* metric (did we act on signals quickly),
 * not a claim about whether the scenario's world will occur.
 */
export function computeAnticipationLeadTime(signal: HorizonSignal, scenario: Scenario): AnticipationRecord {
  const observed = new Date(signal.firstObservedAt).getTime();
  const authored = new Date(scenario.authoredAt).getTime();
  const leadTimeDays = Math.round((authored - observed) / (1000 * 60 * 60 * 24));
  return {
    signalId: signal.id,
    scenarioId: scenario.id,
    firstObservedAt: signal.firstObservedAt,
    scenarioAuthoredAt: scenario.authoredAt,
    leadTimeDays,
  };
}

export function linkScenariosToSignals(scenarios: Scenario[], signals: HorizonSignal[]): AnticipationRecord[] {
  const records: AnticipationRecord[] = [];
  for (const scenario of scenarios) {
    const refIds = new Set(scenario.macroAssumptions.flatMap((m) => m.assumption.sourceRefs ?? []));
    for (const signal of signals) {
      if (refIds.has(signal.id) || scenario.macroAssumptions.some((m) => (m.assumption.sourceRefs ?? []).includes(signal.id))) {
        records.push(computeAnticipationLeadTime(signal, scenario));
      }
    }
  }
  return records;
}

export interface SinglePointForecastFlag {
  flagged: boolean;
  reason?: string;
}

/**
 * Guard against the thing this whole part exists to prevent: a plan built
 * on exactly one imagined future. Flags inputs that look like a disguised
 * single-point forecast (one scenario, or weights so skewed one scenario
 * carries effectively all the planning weight).
 */
export function detectSinglePointForecast(scenarios: Scenario[], dominanceThreshold = 0.85): SinglePointForecastFlag {
  if (scenarios.length <= 1) {
    return { flagged: true, reason: "Only one scenario is in play — this is a single-point forecast wearing scenario clothing." };
  }
  const total = scenarios.reduce((s, sc) => s + sc.planningWeight, 0) || 1;
  const maxShare = Math.max(...scenarios.map((s) => s.planningWeight)) / total;
  if (maxShare >= dominanceThreshold) {
    return {
      flagged: true,
      reason: `One scenario holds ${(maxShare * 100).toFixed(0)}% of planning weight — effectively a single future is being planned around.`,
    };
  }
  return { flagged: false };
}
