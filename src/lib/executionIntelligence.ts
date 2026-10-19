// ---------------------------------------------------------------------------
// Execution Intelligence
// ---------------------------------------------------------------------------
// This repository snapshot does not contain src/lib/metricsEngine.ts,
// predictiveScoring.ts, simulation.ts, physics.ts, emergent.ts,
// riskIntelligence.ts or stakeholders.ts (the engines referenced by the
// Part 7 task brief) and src/db/schema.ts had no project/task/sprint
// tables. Per the task instructions, when no prior model exists the
// fallback formula given in the brief is implemented literally below.
// ---------------------------------------------------------------------------

import type {
  Blocker,
  CrossDependency,
  LeadosEvent,
  Person,
  Project,
  ProjectId,
  Domain,
} from "@/lib/types";

export const CRITICAL_SEVERITY_THRESHOLD = 4; // severity >= 4 is treated as "critical"
const STALE_EVENT_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ConfidenceFactor {
  label: string;
  impact: number; // negative number = points deducted
}

export interface DeliveryConfidence {
  projectId: ProjectId;
  projectName: string;
  status: Project["status"];
  confidence: number;
  factors: ConfidenceFactor[];
}

export interface BlockerHeatmapRow {
  domain: Domain;
  sev1: number;
  sev2: number;
  sev3: number;
  sev4: number;
  sev5: number;
  total: number;
}

export type BlockerHeatmap = BlockerHeatmapRow[];

export type DependencyRiskLevel = "low" | "high" | "critical";

export interface DependencyRisk {
  dependencyId: number;
  fromProject: ProjectId;
  toProject: ProjectId;
  type: CrossDependency["type"];
  risk: DependencyRiskLevel;
  reason: string;
}

export type VelocityTrend = "accelerating" | "stable" | "decelerating";

export interface ExecutionIntelligenceReport {
  executionHealthScore: number;
  deliveryConfidence: DeliveryConfidence[];
  criticalPath: ProjectId[];
  blockerHeatmap: BlockerHeatmap;
  dependencyRisk: DependencyRisk[];
  velocityTrend: VelocityTrend;
  executionNarratives: string[];
  generatedAt: string;
}

export function isOpen(blocker: Blocker): boolean {
  return blocker.resolvedAt === null || blocker.resolvedAt === undefined;
}

export function isCritical(blocker: Blocker): boolean {
  return blocker.severity >= CRITICAL_SEVERITY_THRESHOLD;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isMilestoneOverdue(m: { status: string; dueDate: string | null }, now: Date): boolean {
  if (m.status === "overdue") return true;
  if (m.status === "pending" && m.dueDate) {
    return new Date(m.dueDate).getTime() < now.getTime();
  }
  return false;
}

// ---------------------------------------------------------------------------
// Delivery confidence
// ---------------------------------------------------------------------------

function computeDeliveryConfidence(
  projects: Project[],
  milestones: { projectId: ProjectId; status: string; dueDate: string | null }[],
  blockers: Blocker[],
  crossDeps: CrossDependency[],
  events: LeadosEvent[],
  now: Date,
): DeliveryConfidence[] {
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const lastEventByProject = new Map<ProjectId, number>();
  for (const e of events) {
    if (e.projectId === null || e.projectId === undefined) continue;
    const ts = new Date(e.occurredAt).getTime();
    const prev = lastEventByProject.get(e.projectId);
    if (prev === undefined || ts > prev) lastEventByProject.set(e.projectId, ts);
  }

  return projects.map((project) => {
    const factors: ConfidenceFactor[] = [];
    let confidence = 100;

    const projectMilestones = milestones.filter((m) => m.projectId === project.id);
    const overdueCount = projectMilestones.filter((m) => isMilestoneOverdue(m, now)).length;
    if (overdueCount > 0) {
      const impact = -15 * overdueCount;
      confidence += impact;
      factors.push({ label: `${overdueCount} overdue milestone(s)`, impact });
    }

    const projectBlockers = blockers.filter((b) => b.projectId === project.id && isOpen(b));
    const openCritical = projectBlockers.filter(isCritical).length;
    const openNonCritical = projectBlockers.length - openCritical;
    if (openCritical > 0) {
      const impact = -25 * openCritical;
      confidence += impact;
      factors.push({ label: `${openCritical} open critical blocker(s)`, impact });
    }
    if (openNonCritical > 0) {
      const impact = -10 * openNonCritical;
      confidence += impact;
      factors.push({ label: `${openNonCritical} open non-critical blocker(s)`, impact });
    }

    if (project.ownerId === null || project.ownerId === undefined) {
      confidence += -20;
      factors.push({ label: "No owner assigned", impact: -20 });
    }

    const outgoingBlockedDeps = crossDeps.filter((d) => d.fromProject === project.id);
    let blockedDepCount = 0;
    for (const dep of outgoingBlockedDeps) {
      const target = projectById.get(dep.toProject);
      if (target && target.status === "blocked") blockedDepCount += 1;
    }
    if (blockedDepCount > 0) {
      const impact = -20 * blockedDepCount;
      confidence += impact;
      factors.push({
        label: `${blockedDepCount} dependency/ies pointing to a blocked project`,
        impact,
      });
    }

    const lastEvent = lastEventByProject.get(project.id);
    const staleDays = lastEvent === undefined ? Infinity : (now.getTime() - lastEvent) / MS_PER_DAY;
    if (staleDays > STALE_EVENT_DAYS) {
      confidence += -15;
      factors.push({
        label:
          lastEvent === undefined
            ? "No recorded activity"
            : `No activity in ${Math.floor(staleDays)} days (stale)`,
        impact: -15,
      });
    }

    confidence = clamp(confidence, 0, 100);

    return {
      projectId: project.id,
      projectName: project.name,
      status: project.status,
      confidence,
      factors,
    };
  });
}

// ---------------------------------------------------------------------------
// Critical path — Kahn's algorithm
// ---------------------------------------------------------------------------
//
// Kahn's algorithm (standard pseudocode, implemented exactly below):
//
//   L <- Empty list that will contain the sorted elements
//   S <- Set of all nodes with no incoming edge
//
//   while S is not empty do
//       remove a node n from S
//       add n to tail of L
//       for each node m with an edge e from n to m do
//           remove edge e from the graph
//           if m has no other incoming edges then
//               insert m into S
//
//   if graph has edges then
//       return error   (graph has at least one cycle)
//   else
//       return L   (a topologically sorted order)
//
export interface TopoSortResult {
  order: ProjectId[];
  hasCycle: boolean;
  cycleNodes: ProjectId[];
}

function kahnTopologicalSort(nodes: ProjectId[], edges: [ProjectId, ProjectId][]): TopoSortResult {
  // adjacency: n -> [m, ...] ("edge e from n to m")
  const adjacency = new Map<ProjectId, ProjectId[]>();
  const incomingCount = new Map<ProjectId, number>();
  for (const n of nodes) {
    adjacency.set(n, []);
    incomingCount.set(n, 0);
  }
  let remainingEdgeCount = 0;
  for (const [from, to] of edges) {
    if (!adjacency.has(from) || !incomingCount.has(to)) continue; // ignore dangling refs
    adjacency.get(from)!.push(to);
    incomingCount.set(to, (incomingCount.get(to) ?? 0) + 1);
    remainingEdgeCount += 1;
  }

  const L: ProjectId[] = [];
  const S: ProjectId[] = nodes.filter((n) => (incomingCount.get(n) ?? 0) === 0);

  // local mutable copy of incoming counts, since edges are "removed" from the graph
  const incoming = new Map(incomingCount);

  while (S.length > 0) {
    const n = S.shift()!; // remove a node n from S
    L.push(n); // add n to tail of L
    for (const m of adjacency.get(n) ?? []) {
      // remove edge e (n -> m) from the graph
      incoming.set(m, (incoming.get(m) ?? 0) - 1);
      remainingEdgeCount -= 1;
      if ((incoming.get(m) ?? 0) === 0) {
        S.push(m); // insert m into S
      }
    }
  }

  const hasCycle = remainingEdgeCount > 0;
  const cycleNodes = hasCycle ? nodes.filter((n) => (incoming.get(n) ?? 0) > 0) : [];

  return { order: L, hasCycle, cycleNodes };
}

function computeCriticalPath(
  projects: Project[],
  crossDeps: CrossDependency[],
): { path: ProjectId[]; cycle: TopoSortResult } {
  const nodes = projects.map((p) => p.id);
  const blockEdges: [ProjectId, ProjectId][] = crossDeps
    .filter((d) => d.type === "blocks")
    .map((d) => [d.fromProject, d.toProject]);

  const topo = kahnTopologicalSort(nodes, blockEdges);

  // Longest chain (critical path) via DP over the DAG portion returned by Kahn.
  const adjacency = new Map<ProjectId, ProjectId[]>();
  for (const n of nodes) adjacency.set(n, []);
  for (const [from, to] of blockEdges) {
    if (adjacency.has(from) && adjacency.has(to)) adjacency.get(from)!.push(to);
  }

  const orderedSet = new Set(topo.order);
  const dist = new Map<ProjectId, number>();
  const prev = new Map<ProjectId, ProjectId | null>();
  for (const n of topo.order) {
    dist.set(n, 1);
    prev.set(n, null);
  }
  for (const n of topo.order) {
    for (const m of adjacency.get(n) ?? []) {
      if (!orderedSet.has(m)) continue;
      const candidate = (dist.get(n) ?? 1) + 1;
      if (candidate > (dist.get(m) ?? 1)) {
        dist.set(m, candidate);
        prev.set(m, n);
      }
    }
  }

  let endNode: ProjectId | null = null;
  let best = 0;
  for (const [node, d] of dist.entries()) {
    if (d > best) {
      best = d;
      endNode = node;
    }
  }

  const path: ProjectId[] = [];
  let cursor = endNode;
  while (cursor !== null && cursor !== undefined) {
    path.unshift(cursor);
    cursor = prev.get(cursor) ?? null;
  }

  return { path, cycle: topo };
}

// ---------------------------------------------------------------------------
// Blocker heatmap
// ---------------------------------------------------------------------------

function computeBlockerHeatmap(blockers: Blocker[], projects: Project[]): BlockerHeatmap {
  const projectDomain = new Map(projects.map((p) => [p.id, p.domain]));
  const rows = new Map<Domain, BlockerHeatmapRow>();

  for (const b of blockers) {
    const domain = b.domain ?? projectDomain.get(b.projectId) ?? "unassigned";
    if (!rows.has(domain)) {
      rows.set(domain, { domain, sev1: 0, sev2: 0, sev3: 0, sev4: 0, sev5: 0, total: 0 });
    }
    const row = rows.get(domain)!;
    const sev = clamp(Math.round(b.severity), 1, 5);
    const key = (`sev${sev}` as unknown) as keyof Omit<BlockerHeatmapRow, "domain" | "total">;
    row[key] += 1;
    row.total += 1;
  }

  return Array.from(rows.values()).sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------------
// Dependency risk
// ---------------------------------------------------------------------------

function computeDependencyRisk(
  crossDeps: CrossDependency[],
  projects: Project[],
  confidenceByProject: Map<ProjectId, number>,
): DependencyRisk[] {
  const statusByProject = new Map(projects.map((p) => [p.id, p.status]));

  return crossDeps.map((dep) => {
    const fromStatus = statusByProject.get(dep.fromProject);
    const toStatus = statusByProject.get(dep.toProject);
    const fromConfidence = confidenceByProject.get(dep.fromProject) ?? 100;
    const toConfidence = confidenceByProject.get(dep.toProject) ?? 100;

    let risk: DependencyRiskLevel = "low";
    let reason = "Both projects healthy";

    if (fromStatus === "blocked" || toStatus === "blocked") {
      risk = "critical";
      reason =
        fromStatus === "blocked" && toStatus === "blocked"
          ? "Both projects are blocked"
          : fromStatus === "blocked"
            ? "Source project is blocked"
            : "Target project is blocked";
    } else if (fromConfidence < 60 && toConfidence < 60) {
      risk = "high";
      reason = `Both projects have low confidence (${fromConfidence}, ${toConfidence})`;
    }

    return {
      dependencyId: dep.id,
      fromProject: dep.fromProject,
      toProject: dep.toProject,
      type: dep.type,
      risk,
      reason,
    };
  });
}

// ---------------------------------------------------------------------------
// Velocity trend
// ---------------------------------------------------------------------------

function computeVelocityTrend(events: LeadosEvent[], now: Date): VelocityTrend {
  const sevenDays = 7 * MS_PER_DAY;
  const nowMs = now.getTime();
  let recent = 0;
  let previous = 0;
  for (const e of events) {
    const ts = new Date(e.occurredAt).getTime();
    const age = nowMs - ts;
    if (age < 0) continue;
    if (age <= sevenDays) recent += 1;
    else if (age <= sevenDays * 2) previous += 1;
  }

  if (previous === 0) {
    return recent > 0 ? "accelerating" : "stable";
  }
  const ratio = recent / previous;
  if (ratio >= 1.1) return "accelerating";
  if (ratio <= 0.9) return "decelerating";
  return "stable";
}

// ---------------------------------------------------------------------------
// Execution health score + narratives
// ---------------------------------------------------------------------------

function computeExecutionHealthScore(
  deliveryConfidence: DeliveryConfidence[],
  blockers: Blocker[],
  hasCycle: boolean,
): number {
  const avgConfidence =
    deliveryConfidence.length === 0
      ? 100
      : deliveryConfidence.reduce((sum, d) => sum + d.confidence, 0) / deliveryConfidence.length;

  const openCriticalBlockers = blockers.filter((b) => isOpen(b) && isCritical(b)).length;

  let score = avgConfidence - openCriticalBlockers * 2 - (hasCycle ? 10 : 0);
  return Math.round(clamp(score, 0, 100));
}

function buildNarratives(
  deliveryConfidence: DeliveryConfidence[],
  blockerHeatmap: BlockerHeatmap,
  dependencyRisk: DependencyRisk[],
  velocityTrend: VelocityTrend,
  cycle: TopoSortResult,
  criticalPath: ProjectId[],
  projects: Project[],
): string[] {
  const narratives: string[] = [];
  const projectById = new Map(projects.map((p) => [p.id, p]));

  if (cycle.hasCycle) {
    narratives.push(
      `Critical finding: a circular dependency was detected among projects [${cycle.cycleNodes
        .map((id) => projectById.get(id)?.name ?? `#${id}`)
        .join(" -> ")}]. Critical path analysis excludes the cyclic portion.`,
    );
  }

  const sorted = [...deliveryConfidence].sort((a, b) => a.confidence - b.confidence);
  const worst = sorted[0];
  if (worst && worst.confidence < 70) {
    narratives.push(
      `${worst.projectName} has the lowest delivery confidence (${worst.confidence}): ${worst.factors
        .map((f) => f.label)
        .join(", ") || "no specific factors recorded"}.`,
    );
  }

  const atRisk = sorted.filter((d) => d.confidence < 50).length;
  if (atRisk > 0) {
    narratives.push(`${atRisk} project(s) are below 50% delivery confidence and at risk of slipping.`);
  }

  const hottestRow = blockerHeatmap[0];
  if (hottestRow && hottestRow.total > 0) {
    narratives.push(
      `"${hottestRow.domain}" is the hottest blocker domain with ${hottestRow.total} open/reported blocker(s).`,
    );
  }

  const criticalDeps = dependencyRisk.filter((d) => d.risk === "critical").length;
  const highDeps = dependencyRisk.filter((d) => d.risk === "high").length;
  if (criticalDeps > 0) {
    narratives.push(`${criticalDeps} cross-project dependency/ies are critical risk due to blocked projects.`);
  }
  if (highDeps > 0) {
    narratives.push(`${highDeps} cross-project dependency/ies are high risk (both sides below 60% confidence).`);
  }

  if (criticalPath.length > 1) {
    narratives.push(
      `Critical path: ${criticalPath.map((id) => projectById.get(id)?.name ?? `#${id}`).join(" -> ")}.`,
    );
  }

  narratives.push(
    velocityTrend === "accelerating"
      ? "Execution velocity is accelerating compared to the prior week."
      : velocityTrend === "decelerating"
        ? "Execution velocity is decelerating compared to the prior week."
        : "Execution velocity is stable.",
  );

  return narratives;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function runExecutionIntelligence(
  projects: Project[],
  milestones: { projectId: ProjectId; status: string; dueDate: string | null }[],
  blockers: Blocker[],
  crossDeps: CrossDependency[],
  people: Person[],
  events: LeadosEvent[],
  now: Date,
): ExecutionIntelligenceReport {
  void people; // reserved for future stakeholder-aware scoring (see stakeholders.ts note above)

  const deliveryConfidence = computeDeliveryConfidence(
    projects,
    milestones,
    blockers,
    crossDeps,
    events,
    now,
  );
  const confidenceByProject = new Map(deliveryConfidence.map((d) => [d.projectId, d.confidence]));

  const { path: criticalPath, cycle } = computeCriticalPath(projects, crossDeps);
  const blockerHeatmap = computeBlockerHeatmap(blockers, projects);
  const dependencyRisk = computeDependencyRisk(crossDeps, projects, confidenceByProject);
  const velocityTrend = computeVelocityTrend(events, now);
  const executionHealthScore = computeExecutionHealthScore(deliveryConfidence, blockers, cycle.hasCycle);
  const executionNarratives = buildNarratives(
    deliveryConfidence,
    blockerHeatmap,
    dependencyRisk,
    velocityTrend,
    cycle,
    criticalPath,
    projects,
  );

  return {
    executionHealthScore,
    deliveryConfidence,
    criticalPath,
    blockerHeatmap,
    dependencyRisk,
    velocityTrend,
    executionNarratives,
    generatedAt: now.toISOString(),
  };
}
