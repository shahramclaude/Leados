import type { CriticalPathResult, Domain, ExecutionReport, MomentumReport, Project, Severity } from "@/lib/types";
import type { BrainProjection, ProjectState } from "@/lib/eventBrain";

function toProject(p: ProjectState): Project {
  return {
    id: p.id,
    title: p.title,
    domain: p.domain,
    owner: p.owner,
    status: p.status,
    confidence: p.confidence,
    dependsOn: p.dependsOn,
    durationDays: p.durationDays,
    milestones: p.milestones.map((m) => ({ id: m.id, title: m.title, dueDate: m.dueDate, completed: m.completed, overdue: m.overdue })),
    blockers: p.blockers.map((b) => ({ id: b.id, severity: b.severity, description: b.description, resolved: b.resolved, raisedAt: b.raisedAt })),
  };
}

/**
 * Kahn's algorithm (topological sort) over the project dependency DAG.
 * Cite: Kahn, A. B. (1962). "Topological sorting of large networks."
 * Communications of the ACM, 5(11), 558-562.
 * Also computes the critical path = longest weighted chain (by durationDays)
 * through the DAG, and flags cycles rather than silently dropping nodes.
 */
export function computeCriticalPath(projects: ProjectState[]): CriticalPathResult {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const p of projects) {
    inDegree.set(p.id, inDegree.get(p.id) ?? 0);
    adjacency.set(p.id, adjacency.get(p.id) ?? []);
  }
  for (const p of projects) {
    for (const dep of p.dependsOn) {
      if (!byId.has(dep)) continue; // dependency outside known set — ignore
      adjacency.set(dep, [...(adjacency.get(dep) ?? []), p.id]);
      inDegree.set(p.id, (inDegree.get(p.id) ?? 0) + 1);
    }
  }

  const queue: string[] = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const order: string[] = [];
  const longestEndingAt = new Map<string, number>();
  const predecessor = new Map<string, string | null>();
  for (const p of projects) longestEndingAt.set(p.id, p.durationDays);
  const workingInDegree = new Map(inDegree);

  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    const node = byId.get(id)!;
    for (const next of adjacency.get(id) ?? []) {
      const candidate = (longestEndingAt.get(id) ?? 0) + (byId.get(next)?.durationDays ?? 0);
      if (candidate > (longestEndingAt.get(next) ?? 0)) {
        longestEndingAt.set(next, candidate);
        predecessor.set(next, id);
      }
      workingInDegree.set(next, (workingInDegree.get(next) ?? 0) - 1);
      if ((workingInDegree.get(next) ?? 0) === 0) queue.push(next);
    }
    void node;
  }

  const cyclesDetected = order.length !== projects.length;

  // Reconstruct critical path by walking back from the node with max longestEndingAt.
  let endNode: string | null = null;
  let maxLen = -1;
  for (const [id, len] of longestEndingAt.entries()) {
    if (len > maxLen) {
      maxLen = len;
      endNode = id;
    }
  }
  const criticalPath: string[] = [];
  let cursor = endNode;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    criticalPath.unshift(cursor);
    cursor = predecessor.get(cursor) ?? null;
  }

  // Bottleneck = project on the critical path with the lowest confidence.
  let bottleneck: string | null = null;
  let lowestConfidence = 2;
  for (const id of criticalPath) {
    const conf = byId.get(id)?.confidence ?? 1;
    if (conf < lowestConfidence) {
      lowestConfidence = conf;
      bottleneck = id;
    }
  }

  return {
    order: cyclesDetected ? order : order,
    criticalPath,
    bottleneck,
    cyclesDetected,
    totalDurationDays: maxLen < 0 ? 0 : maxLen,
  };
}

// DESIGN PARAMETER: momentum thresholds — >1.2 ACCELERATING, 0.8-1.2 STEADY,
// <0.8 DECELERATING (and >0), 0 STALLED.
export function computeMomentum(projection: BrainProjection, now: Date): MomentumReport {
  const WINDOW_MS = 14 * 86400000;
  let completed14d = 0;
  let pending14d = 0;
  for (const p of projection.projects) {
    for (const m of p.milestones) {
      const due = new Date(m.dueDate).getTime();
      const within14 = now.getTime() - due <= WINDOW_MS && due <= now.getTime() + WINDOW_MS;
      if (m.completed && within14) completed14d++;
      if (!m.completed && within14) pending14d++;
    }
  }
  const momentumIndex = pending14d > 0 ? completed14d / pending14d : completed14d > 0 ? 2 : 0;
  let label: MomentumReport["label"] = "STALLED";
  if (momentumIndex === 0) label = "STALLED";
  else if (momentumIndex > 1.2) label = "ACCELERATING";
  else if (momentumIndex >= 0.8) label = "STEADY";
  else label = "DECELERATING";
  return { momentumIndex, label, completed14d, pending14d };
}

export function buildExecutionReport(projection: BrainProjection, now: Date): ExecutionReport {
  const projects = projection.projects.map(toProject);
  const activeProjects = projects.filter((p) => p.status !== "done").length;
  const blockedProjects = projects.filter((p) => p.status === "blocked").length;
  const overdueMilestones = projects.reduce((a, p) => a + p.milestones.filter((m) => m.overdue && !m.completed).length, 0);
  const avgConfidence = projects.length ? projects.reduce((a, p) => a + p.confidence, 0) / projects.length : 0;
  const openBlockers = projects.reduce((a, p) => a + p.blockers.filter((b) => !b.resolved).length, 0);

  const heatmapMap = new Map<string, number>();
  for (const p of projects) {
    for (const b of p.blockers.filter((bb) => !bb.resolved)) {
      const key = `${p.domain}::${b.severity}`;
      heatmapMap.set(key, (heatmapMap.get(key) ?? 0) + 1);
    }
  }
  const domains: Domain[] = ["people", "finance", "strategy", "execution", "rd", "sales", "knowledge", "manufacturing"];
  const severities: Severity[] = ["low", "medium", "high", "critical"];
  const blockerHeatmap = domains.flatMap((domain) =>
    severities.map((severity) => ({ domain, severity, count: heatmapMap.get(`${domain}::${severity}`) ?? 0 }))
  );

  return {
    kpis: { activeProjects, blockedProjects, overdueMilestones, avgConfidence, openBlockers },
    criticalPath: computeCriticalPath(projection.projects),
    momentum: computeMomentum(projection, now),
    projects,
    blockerHeatmap,
  };
}
