// executionEngine — execution command: turns raw projects/milestones/
// blockers into a probabilistic, explainable delivery-confidence score, a
// critical path with float, Monte Carlo schedule risk, and a cross-project
// dependency map that flags where one project's lateness will cascade.
import {
  computeCriticalPath,
  simulateScheduleRisk,
  probabilityOfOnTimeDelivery,
  type ProjectNode,
  type CpmReport,
  type ScheduleRiskResult,
} from "@/lib/criticalPath";
import { computeDeliveryConfidence } from "@/lib/executionIntel";

export interface ExecMilestone {
  id: number;
  projectId: number;
  title: string;
  durationDays: number;
  durationP90Days: number | null;
  dependsOn: number[];
  dueDate: string | null;
  status: "not_started" | "in_progress" | "done" | "blocked";
  completedAt: string | null;
}

export interface ExecBlocker {
  id: number;
  projectId: number;
  milestoneId: number | null;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  impactDays: number;
  raisedAt: string;
  resolvedAt: string | null;
}

export interface ExecProjectRecord {
  id: number;
  name: string;
  status: string;
  startDate: string;
  targetDate: string;
}

const SEVERITY_WEIGHT: Record<ExecBlocker["severity"], number> = { low: 0.1, medium: 0.3, high: 0.6, critical: 1 };

function daysBetween(a: string | Date, b: string | Date): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export interface ProjectExecutionReport {
  project: ExecProjectRecord;
  cpm: CpmReport;
  scheduleRisk: ScheduleRiskResult;
  onTimeProbability: number;
  deliveryConfidence: { score: number; contributions: Record<string, number> };
  openBlockers: ExecBlocker[];
  scopeCreepScore: number;
  scheduleAdherence: number;
  explanation: string[];
}

/**
 * Full execution analysis for a single project: CPM float, Monte Carlo
 * schedule risk, and a blended, explainable delivery-confidence score.
 */
export function analyzeProject(project: ExecProjectRecord, milestones: ExecMilestone[], blockers: ExecBlocker[], now: Date = new Date()): ProjectExecutionReport {
  const nodes: ProjectNode[] = milestones.map((m) => ({
    id: String(m.id),
    durationDays: m.durationDays,
    durationP90Days: m.durationP90Days ?? undefined,
    dependsOn: m.dependsOn.map(String),
  }));
  const cpm = computeCriticalPath(nodes);
  const scheduleRisk = simulateScheduleRisk(nodes);
  const deadlineDays = daysBetween(project.startDate, project.targetDate);
  const onTimeProbability = probabilityOfOnTimeDelivery(scheduleRisk, deadlineDays);

  const openBlockers = blockers.filter((b) => !b.resolvedAt);
  const blockerPressure = Math.min(
    1,
    openBlockers.reduce((sum, b) => sum + SEVERITY_WEIGHT[b.severity], 0) / 2,
  );

  const totalMilestones = milestones.length || 1;
  const overdue = milestones.filter((m) => m.status !== "done" && m.dueDate && new Date(m.dueDate).getTime() < now.getTime()).length;
  const scheduleAdherence = Math.max(0, 1 - overdue / totalMilestones);

  // Scope creep proxy: milestones added/blocked relative to original plan isn't directly modeled,
  // so we use the ratio of "blocked" status milestones as a visible, explainable proxy.
  const blockedCount = milestones.filter((m) => m.status === "blocked").length;
  const scopeCreepScore = Math.min(1, blockedCount / totalMilestones + openBlockers.length * 0.05);

  const deliveryConfidence = computeDeliveryConfidence({ scopeCreepScore, blockerPressure, scheduleAdherence, onTimeProbability });

  const explanation = [
    `Monte Carlo schedule simulation (n=${scheduleRisk.completionDays.n}) gives a ${Math.round(onTimeProbability * 100)}% chance of finishing by the ${Math.round(deadlineDays)}-day target; median projected duration is ${Math.round(scheduleRisk.completionDays.p50)} days.`,
    cpm.criticalPath.length ? `Critical path runs through ${cpm.criticalPath.length} milestone(s) with zero float: ${cpm.criticalPath.join(", ")}.` : "No critical path could be computed (empty or cyclic milestone graph).",
    `${openBlockers.length} open blocker(s) contribute ${Math.round(blockerPressure * 100)}% blocker pressure.`,
    `${overdue} of ${totalMilestones} milestones are overdue, giving ${Math.round(scheduleAdherence * 100)}% schedule adherence.`,
  ];

  return { project, cpm, scheduleRisk, onTimeProbability, deliveryConfidence, openBlockers, scopeCreepScore, scheduleAdherence, explanation };
}

export interface CrossProjectDependency {
  upstreamProjectId: number;
  downstreamProjectId: number;
  upstreamOnTimeProbability: number;
  cascadeRisk: "low" | "medium" | "high";
  note: string | null;
}

/**
 * Cross-project dependency map: for each declared upstream->downstream
 * edge, flags cascade risk based on the upstream project's own on-time
 * probability (a late upstream project drags its dependents with it).
 */
export function buildDependencyMap(
  dependencies: { upstreamProjectId: number; downstreamProjectId: number; note: string | null }[],
  reports: Map<number, ProjectExecutionReport>,
): CrossProjectDependency[] {
  return dependencies.map((dep) => {
    const upstream = reports.get(dep.upstreamProjectId);
    const p = upstream?.onTimeProbability ?? 0.5;
    const cascadeRisk: CrossProjectDependency["cascadeRisk"] = p < 0.4 ? "high" : p < 0.7 ? "medium" : "low";
    return { ...dep, upstreamOnTimeProbability: p, cascadeRisk };
  });
}
