// =============================================================================
// LEADOS — Part 23 — Decision velocity metrics + decision debt
// =============================================================================
// Pure functions operating on plain data pulled from the event/state-transition
// log, so they can be unit-tested without a DB and reused by both the API
// routes and the verify script against seeded data.
// =============================================================================

import type { DecisionStatus, TriggerCondition } from "./types";
import { DECISION_FUNNEL } from "./types";

export interface StateTransitionRow {
  decisionId: string;
  fromState: string | null;
  toState: string;
  createdAt: Date;
}

export interface TimeInStateSample {
  decisionId: string;
  state: DecisionStatus;
  durationMs: number;
}

/** Converts a flat list of transitions (any number of decisions mixed
 * together) into per-decision, per-state durations. */
export function computeTimeInState(transitions: StateTransitionRow[]): TimeInStateSample[] {
  const byDecision = new Map<string, StateTransitionRow[]>();
  for (const t of transitions) {
    const list = byDecision.get(t.decisionId) ?? [];
    list.push(t);
    byDecision.set(t.decisionId, list);
  }

  const samples: TimeInStateSample[] = [];
  for (const [decisionId, list] of byDecision) {
    const sorted = [...list].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      const durationMs = next
        ? next.createdAt.getTime() - cur.createdAt.getTime()
        : Date.now() - cur.createdAt.getTime(); // still in this state
      samples.push({ decisionId, state: cur.toState as DecisionStatus, durationMs });
    }
  }
  return samples;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export interface VelocityByState {
  state: DecisionStatus;
  count: number;
  p50Ms: number;
  p95Ms: number;
}

export function computeVelocityByState(samples: TimeInStateSample[]): VelocityByState[] {
  return DECISION_FUNNEL.map((state) => {
    const durations = samples.filter((s) => s.state === state).map((s) => s.durationMs);
    return {
      state,
      count: durations.length,
      p50Ms: percentile(durations, 50),
      p95Ms: percentile(durations, 95),
    };
  });
}

export interface QueueDepthInput {
  decisionId: string;
  status: DecisionStatus;
  deciderRole: string | null;
}

export interface QueueDepthByRole {
  role: string;
  openCount: number;
}

export function computeQueueDepthByRole(decisions: QueueDepthInput[]): QueueDepthByRole[] {
  const counts = new Map<string, number>();
  for (const d of decisions) {
    if (d.status === "reviewed") continue;
    const role = d.deciderRole ?? "(unconfigured)";
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([role, openCount]) => ({ role, openCount }))
    .sort((a, b) => b.openCount - a.openCount);
}

// --- Decision debt ------------------------------------------------------------

export interface DebtCandidate {
  decisionId: string;
  question: string;
  status: DecisionStatus;
  triggerConditions: TriggerCondition[];
}

export interface LatestSignalValue {
  signal: string;
  value: number;
}

function isBreached(tc: TriggerCondition, latest: Map<string, number>): boolean {
  const v = latest.get(tc.signal);
  if (v === undefined) return false;
  switch (tc.op) {
    case "gt":
      return v > tc.value;
    case "gte":
      return v >= tc.value;
    case "lt":
      return v < tc.value;
    case "lte":
      return v <= tc.value;
    case "eq":
      return v === tc.value;
    default:
      return false;
  }
}

export interface DecisionDebtItem {
  decisionId: string;
  question: string;
  breachedSignals: string[];
}

/** "Decision debt" borrowed from tech-debt framing: a decision that is still
 * unmade (status before 'decided') whose own trigger condition has already
 * fired — meaning reality has outpaced the organization's willingness to
 * decide. */
export function computeDecisionDebt(
  candidates: DebtCandidate[],
  latestSignals: LatestSignalValue[],
): DecisionDebtItem[] {
  const latest = new Map(latestSignals.map((s) => [s.signal, s.value]));
  const openStates: DecisionStatus[] = ["raised", "framed", "evidence_gathered"];

  const debt: DecisionDebtItem[] = [];
  for (const c of candidates) {
    if (!openStates.includes(c.status)) continue;
    const breached = c.triggerConditions.filter((tc) => isBreached(tc, latest));
    if (breached.length > 0) {
      debt.push({
        decisionId: c.decisionId,
        question: c.question,
        breachedSignals: breached.map((b) => b.signal),
      });
    }
  }
  return debt;
}
