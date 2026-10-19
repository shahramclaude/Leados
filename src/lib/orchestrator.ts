// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
// This repository snapshot does not yet contain the orchestrator pipeline
// from earlier parts (no metricsEngine/predictiveScoring/simulation/physics/
// emergent/riskIntelligence stages exist in this codebase). This file
// introduces a minimal, extensible pipeline and registers the Part 7
// "Execution Intelligence" stage. Future parts can push additional stages
// onto `pipelineStages` without touching the runner itself.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { blockers, crossDependencies, events, milestones, people, projects } from "@/db/schema";
import {
  runExecutionIntelligence,
  type ExecutionIntelligenceReport,
} from "@/lib/executionIntelligence";
import type {
  Blocker,
  CrossDependency,
  LeadosEvent,
  Milestone,
  Person,
  Project,
} from "@/lib/types";

export interface ExecutionInputs {
  projects: Project[];
  milestones: Milestone[];
  blockers: Blocker[];
  crossDependencies: CrossDependency[];
  people: Person[];
  events: LeadosEvent[];
}

export async function loadExecutionInputs(): Promise<ExecutionInputs> {
  const [projectRows, milestoneRows, blockerRows, crossDepRows, peopleRows, eventRows] =
    await Promise.all([
      db.select().from(projects),
      db.select().from(milestones),
      db.select().from(blockers),
      db.select().from(crossDependencies),
      db.select().from(people),
      db.select().from(events),
    ]);

  return {
    projects: projectRows.map((p) => ({
      id: p.id,
      name: p.name,
      domain: p.domain,
      ownerId: p.ownerId,
      startDate: p.startDate ? p.startDate.toISOString() : null,
      targetDate: p.targetDate ? p.targetDate.toISOString() : null,
      status: p.status,
      confidence: p.confidence,
      createdAt: p.createdAt.toISOString(),
    })),
    milestones: milestoneRows.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      title: m.title,
      dueDate: m.dueDate ? m.dueDate.toISOString() : null,
      status: m.status,
      completedAt: m.completedAt ? m.completedAt.toISOString() : null,
    })),
    blockers: blockerRows.map((b) => ({
      id: b.id,
      projectId: b.projectId,
      title: b.title,
      severity: b.severity,
      reportedBy: b.reportedBy,
      assignedTo: b.assignedTo,
      domain: b.domain,
      reportedAt: b.reportedAt.toISOString(),
      resolvedAt: b.resolvedAt ? b.resolvedAt.toISOString() : null,
    })),
    crossDependencies: crossDepRows.map((d) => ({
      id: d.id,
      fromProject: d.fromProject,
      toProject: d.toProject,
      type: d.type,
      strength: d.strength,
    })),
    people: peopleRows.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      role: p.role,
      domain: p.domain,
    })),
    events: eventRows.map((e) => ({
      id: e.id,
      type: e.type,
      domain: e.domain,
      projectId: e.projectId,
      personId: e.personId,
      payload: e.payload,
      occurredAt: e.occurredAt.toISOString(),
    })),
  };
}

export interface OrchestrationReport {
  generatedAt: string;
  execution: ExecutionIntelligenceReport;
}

interface PipelineStage {
  name: string;
  run: (now: Date) => Promise<Partial<OrchestrationReport>>;
}

const executionIntelligenceStage: PipelineStage = {
  name: "execution-intelligence",
  run: async (now: Date) => {
    const inputs = await loadExecutionInputs();
    const execution = runExecutionIntelligence(
      inputs.projects,
      inputs.milestones,
      inputs.blockers,
      inputs.crossDependencies,
      inputs.people,
      inputs.events,
      now,
    );
    return { execution };
  },
};

// Future parts register additional stages here (metrics, predictive scoring,
// simulation, risk intelligence, emergent patterns, ...).
const pipelineStages: PipelineStage[] = [executionIntelligenceStage];

export async function runOrchestrator(now: Date = new Date()): Promise<OrchestrationReport> {
  let report: Partial<OrchestrationReport> = { generatedAt: now.toISOString() };

  for (const stage of pipelineStages) {
    const partial = await stage.run(now);
    report = { ...report, ...partial };
  }

  return report as OrchestrationReport;
}
