// =============================================================================
// Leados — Orchestrator
// -----------------------------------------------------------------------------
// Not present in this checkout (Parts 1-5 missing). Rebuilt at the scope
// needed to wire Part 6 (Execution Intelligence) to real data: loads rows via
// Drizzle, calls physics.ts + beliefFabric.ts (quoted signatures below), and
// hands fully-typed arrays to the pure executionIntelligence.ts module.
//
// physics.ts exports (quoted exactly from src/lib/physics.ts):
//   export function measureOrgEntropy(events: LeadosEvent[], people: PersonRecord[]): number
//   export function computeLeadershipEnergyBudget(events: LeadosEvent[], people: PersonRecord[]): number
// =============================================================================

import { db } from "@/db";
import {
  blockers as blockersTable,
  crossDependencies as crossDepsTable,
  leadosEvents as eventsTable,
  milestones as milestonesTable,
  people as peopleTable,
  projectSnapshots as snapshotsTable,
  projects as projectsTable,
} from "@/db/schema";
import { computeLeadershipEnergyBudget, measureOrgEntropy } from "./physics";
import { computeExecutionRiskPosterior } from "./beliefFabric";
import { buildExecutionIntelligenceReport } from "./executionIntelligence";
import type {
  Blocker,
  CrossDependency,
  ExecutionIntelligenceReport,
  LeadosEvent,
  Milestone,
  PersonRecord,
  Project,
  ProjectSnapshot,
} from "./types";

function toProject(row: typeof projectsTable.$inferSelect): Project {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    ownerId: row.ownerId,
    startDate: row.startDate,
    targetDate: row.targetDate,
    status: (row.status as Project["status"]) ?? "planning",
    scopeStatement: row.scopeStatement ?? "",
    confidence: row.confidence ?? 50,
    impact: row.impact ?? 3,
    createdAt: row.createdAt ?? new Date(),
    updatedAt: row.updatedAt ?? new Date(),
  };
}

function toMilestone(row: typeof milestonesTable.$inferSelect): Milestone {
  return {
    id: row.id,
    projectId: row.projectId as number,
    title: row.title,
    dueDate: row.dueDate,
    status: (row.status as Milestone["status"]) ?? "pending",
    completedAt: row.completedAt,
  };
}

function toBlocker(row: typeof blockersTable.$inferSelect): Blocker {
  return {
    id: row.id,
    projectId: row.projectId as number,
    title: row.title,
    description: row.description ?? "",
    severity: row.severity ?? 2,
    reportedBy: row.reportedBy,
    assignedTo: row.assignedTo,
    domain: row.domain,
    reportedAt: row.reportedAt ?? new Date(),
    resolvedAt: row.resolvedAt,
  };
}

function toCrossDep(row: typeof crossDepsTable.$inferSelect): CrossDependency {
  return {
    id: row.id,
    fromProject: row.fromProject as number,
    toProject: row.toProject as number,
    type: row.type as CrossDependency["type"],
    strength: row.strength ?? 1,
  };
}

function toPerson(row: typeof peopleTable.$inferSelect): PersonRecord {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    flightRisk: row.flightRisk ?? 0,
    burnoutRisk: row.burnoutRisk ?? 0,
  };
}

function toEvent(row: typeof eventsTable.$inferSelect): LeadosEvent {
  return {
    id: row.id,
    type: row.type,
    projectId: row.projectId,
    personId: row.personId,
    domain: row.domain,
    payload: row.payload,
    createdAt: row.createdAt ?? new Date(),
  };
}

function toSnapshot(row: typeof snapshotsTable.$inferSelect): ProjectSnapshot {
  return {
    id: row.id,
    projectId: row.projectId as number,
    snapshotAt: row.snapshotAt ?? new Date(),
    confidence: row.confidence ?? 0,
    status: row.status ?? "",
    blockerCount: row.blockerCount ?? 0,
    milestoneDone: row.milestoneDone ?? 0,
    milestoneTotal: row.milestoneTotal ?? 0,
  };
}

export async function loadExecutionDomain() {
  const [projectRows, milestoneRows, blockerRows, crossDepRows, peopleRows, eventRows, snapshotRows] =
    await Promise.all([
      db.select().from(projectsTable),
      db.select().from(milestonesTable),
      db.select().from(blockersTable),
      db.select().from(crossDepsTable),
      db.select().from(peopleTable),
      db.select().from(eventsTable),
      db.select().from(snapshotsTable),
    ]);

  return {
    projects: projectRows.map(toProject),
    milestones: milestoneRows.map(toMilestone),
    blockers: blockerRows.map(toBlocker),
    crossDeps: crossDepRows.map(toCrossDep),
    people: peopleRows.map(toPerson),
    events: eventRows.map(toEvent),
    snapshots: snapshotRows.map(toSnapshot),
  };
}

/**
 * generateExecutionIntelligenceReport()
 * Loads all execution-domain rows, computes org entropy / leadership energy
 * budget via physics.ts, derives the execution-risk posterior via
 * beliefFabric.ts, then builds the full ExecutionIntelligenceReport via the
 * pure executionIntelligence.ts module.
 */
export async function generateExecutionIntelligenceReport(): Promise<ExecutionIntelligenceReport> {
  const domain = await loadExecutionDomain();
  const now = new Date();

  const orgEntropy = measureOrgEntropy(domain.events, domain.people);
  const energyBudget = computeLeadershipEnergyBudget(domain.events, domain.people);
  const executionRiskPosterior = computeExecutionRiskPosterior(
    domain.projects,
    domain.milestones,
    domain.blockers,
  );

  return buildExecutionIntelligenceReport({
    projects: domain.projects,
    milestones: domain.milestones,
    blockers: domain.blockers,
    crossDeps: domain.crossDeps,
    people: domain.people,
    events: domain.events,
    snapshots: domain.snapshots,
    orgEntropy,
    energyBudget,
    executionRiskPosterior,
    now,
  });
}
