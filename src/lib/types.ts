// ---------------------------------------------------------------------------
// Shared domain types for the Leados intelligence engines.
//
// This snapshot does not contain src/lib/metricsEngine.ts, predictiveScoring.ts,
// simulation.ts, physics.ts, emergent.ts, riskIntelligence.ts or
// stakeholders.ts — those engines from earlier parts are not present in this
// repository, so these types are defined fresh to match the shapes described
// in the Part 7 task spec (Project/Milestone/Blocker/CrossDependency/Person/
// LeadosEvent).
// ---------------------------------------------------------------------------

export type Domain = string;

export type ProjectId = number;

export interface Person {
  id: number;
  name: string;
  email: string | null;
  role: string | null;
  domain: Domain | null;
}

export interface LeadosEvent {
  id: number;
  type: string;
  domain: Domain | null;
  projectId: number | null;
  personId: number | null;
  payload: unknown;
  occurredAt: string;
}

export type ProjectStatus = "planning" | "active" | "blocked" | "complete";

export interface Project {
  id: ProjectId;
  name: string;
  domain: Domain;
  ownerId: number | null;
  startDate: string | null;
  targetDate: string | null;
  status: ProjectStatus;
  confidence: number;
  createdAt: string;
}

export type MilestoneStatus = "pending" | "done" | "overdue";

export interface Milestone {
  id: number;
  projectId: ProjectId;
  title: string;
  dueDate: string | null;
  status: MilestoneStatus;
  completedAt: string | null;
}

export interface Blocker {
  id: number;
  projectId: ProjectId;
  title: string;
  severity: number;
  reportedBy: number | null;
  assignedTo: number | null;
  domain: Domain | null;
  reportedAt: string;
  resolvedAt: string | null;
}

export type DependencyType = "blocks" | "enables" | "shares_resource";

export interface CrossDependency {
  id: number;
  fromProject: ProjectId;
  toProject: ProjectId;
  type: DependencyType;
  strength: number;
}
