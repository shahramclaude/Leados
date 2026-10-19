// Pure data-shape contract consumed by runFullOrchestration (src/lib/orchestrator.ts).
// This file has ZERO imports of @/db or "pg" so it is safe to import from the
// browser (src/lib/selfTest.ts builds an OrchestrationDataset by hand as a
// stand-in "mock DB" without ever touching Postgres).

import type { DomainKey, Severity } from "./types";

export interface PersonRow {
  id: string;
  name: string;
  role: string;
  team: string;
}

export interface EventRow {
  id: string;
  personId: string;
  type: string;
  weight: number;
  createdAt: string;
}

export interface OneOnOneRow {
  id: string;
  personId: string;
  occurredAt: string;
  actionItemsTotal: number;
  actionItemsCompleted: number;
}

export interface DecisionRow {
  id: string;
  title: string;
  domain: DomainKey;
  status: "open" | "closed";
  sev: Severity;
  createdAt: string;
}

export interface ScenarioRow {
  id: string;
  title: string;
  domain: DomainKey;
  status: "active" | "archived";
  sev: Severity;
  createdAt: string;
}

export interface ProjectRow {
  id: string;
  name: string;
  dependsOn: string[];
}

export interface MilestoneRow {
  id: string;
  projectId: string;
  dueDate: string;
  completed: boolean;
}

export interface BlockerRow {
  id: string;
  title: string;
  domain: DomainKey;
  projectId: string | null;
  status: "open" | "resolved";
  sev: Severity;
  createdAt: string;
}

export interface HypothesisRow {
  id: string;
  personId: string;
  type: string;
  title: string;
  sev: Severity;
  status: "open" | "dismissed" | "confirmed";
  dedupeKey: string;
  createdAt: string;
}

export interface OkrRow {
  id: string;
  title: string;
  domain: DomainKey;
  progress: number;
  timeElapsed: number;
}

export interface NotificationRow {
  id: string;
  domain: DomainKey;
  title: string;
  message: string;
  sev: Severity;
  read: boolean;
  createdAt: string;
}

export interface FinanceSnapshot {
  startingCash: number;
  monthlyBurn: number;
  burnStdDev: number;
  monthlyRevenue: number;
  revenueGrowthRate: number;
}

export interface OrchestrationDataset {
  /** Injectable clock for deterministic tests; defaults to `new Date()`. */
  now?: Date;
  people: PersonRow[];
  events: EventRow[];
  oneOnOnes: OneOnOneRow[];
  decisions: DecisionRow[];
  scenarios: ScenarioRow[];
  projects: ProjectRow[];
  milestones: MilestoneRow[];
  blockers: BlockerRow[];
  hypotheses: HypothesisRow[];
  okrs: OkrRow[];
  notifications: NotificationRow[];
  finance: FinanceSnapshot;
}
