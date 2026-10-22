import type { Explain } from "@/lib/explain";

/**
 * Core change-program domain model (Phase 1 — MODEL).
 *
 * Adoption is measured exclusively via observable proxies from the event
 * log (feature usage, process conformance, ritual participation) — never
 * via surveillance or individual sentiment scoring. All group-level
 * read paths are k-anonymity gated (see `src/lib/privacy/aggregation.ts`).
 */

export type ProxyKind = "feature_usage" | "process_conformance" | "ritual_participation";

export interface TargetBehavior {
  /** The behavior change intends to produce, in plain language. */
  behavior: string;
  /** Which class of observable proxy stands in for this behavior. */
  observableProxy: ProxyKind;
  /** The concrete event-log event type counted as evidence of the proxy. */
  proxyEventType: string;
}

export type FunnelStage = "awareness" | "trial" | "habit";

export interface Intervention {
  id: string;
  programId: string;
  kind: string;
  cost: number;
  /** Hypothesis, not a promise — always carries an Explain envelope. */
  expectedEffect: Explain<number>;
  rolloutDesign?: RolloutDesign;
  status: "proposed" | "running" | "completed" | "abandoned";
  startDate: string;
}

export interface ResistanceMapEntry {
  group: string;
  driver: string;
  mitigation: string;
}

export type ChangeProgramStatus = "planned" | "active" | "paused" | "completed";

export interface ChangeProgram {
  id: string;
  intent: string;
  targetBehaviors: TargetBehavior[];
  affectedGroups: string[];
  resistanceMap: ResistanceMapEntry[];
  status: ChangeProgramStatus;
  startDate: string;
  /** Rough weekly "intensity" used by the change-load index (1 = typical program). */
  loadWeight: number;
}

/** Stepped-wedge or simple two-arm rollout assignment, deterministic via prng.ts. */
export type RolloutKind = "stepped_wedge" | "two_arm";

export interface SteppedWedgeAssignment {
  kind: "stepped_wedge";
  seed: string;
  periods: number;
  /** groupId -> period index (0-based) at which the group crosses to treatment. */
  crossoverPeriodByGroup: Record<string, number>;
}

export interface TwoArmAssignment {
  kind: "two_arm";
  seed: string;
  treatmentGroups: string[];
  controlGroups: string[];
}

export type RolloutDesign = SteppedWedgeAssignment | TwoArmAssignment;

export interface FunnelCounts {
  awareness: number;
  trial: number;
  habit: number;
}

export interface GroupReadinessInputs {
  trainingCompletionRate: number; // 0..1, aggregate
  capacityHeadroom: number; // 0..1, from the capacity-twin stand-in
  priorChangeLoad: number; // concurrent active programs (count, additive)
}
