// criticalPath — classic CPM (forward/backward pass, float) plus a Monte
// Carlo schedule-risk simulation over PERT-style duration uncertainty, so
// "when will this ship" is answered as a distribution, not a date.
import { mulberry32, summarizeDistribution, type Distribution } from "@/lib/prng";

export interface ProjectNode {
  id: string;
  durationDays: number;
  /** Optimistic/pessimistic spread for Monte Carlo schedule risk; defaults to +40% if omitted. */
  durationP90Days?: number;
  dependsOn: string[];
}

export interface CycleDetectionResult {
  hasCycle: boolean;
  cycle: string[];
}

/** Directed-graph cycle detection via 3-color DFS (unvisited / visiting / done). */
export function detectCycle(nodes: ProjectNode[]): CycleDetectionResult {
  const graph = new Map(nodes.map((n) => [n.id, n.dependsOn]));
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  let cycle: string[] = [];

  function visit(id: string): boolean {
    state.set(id, 1);
    stack.push(id);
    for (const dep of graph.get(id) ?? []) {
      const depState = state.get(dep) ?? 0;
      if (depState === 1) {
        const idx = stack.indexOf(dep);
        cycle = stack.slice(idx === -1 ? 0 : idx).concat(dep);
        return true;
      }
      if (depState === 0 && graph.has(dep) && visit(dep)) return true;
    }
    stack.pop();
    state.set(id, 2);
    return false;
  }

  for (const n of nodes) {
    if ((state.get(n.id) ?? 0) === 0 && visit(n.id)) return { hasCycle: true, cycle };
  }
  return { hasCycle: false, cycle: [] };
}

export interface CpmResult {
  id: string;
  earliestStart: number;
  earliestFinish: number;
  latestStart: number;
  latestFinish: number;
  float: number;
  isCritical: boolean;
}

export interface CpmReport {
  nodes: CpmResult[];
  criticalPath: string[];
  projectDurationDays: number;
  hasCycle: boolean;
}

/** Forward/backward-pass critical path method with float (slack) per node. */
export function computeCriticalPath(nodes: ProjectNode[]): CpmReport {
  const { hasCycle } = detectCycle(nodes);
  if (hasCycle || nodes.length === 0) {
    return { nodes: [], criticalPath: [], projectDurationDays: 0, hasCycle };
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const successors = new Map<string, string[]>();
  for (const n of nodes) {
    for (const dep of n.dependsOn) {
      if (!successors.has(dep)) successors.set(dep, []);
      successors.get(dep)!.push(n.id);
    }
  }

  // Topological order via Kahn's algorithm (safe given hasCycle === false).
  const inDegree = new Map(nodes.map((n) => [n.id, n.dependsOn.length]));
  const queue = nodes.filter((n) => n.dependsOn.length === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const succ of successors.get(id) ?? []) {
      inDegree.set(succ, (inDegree.get(succ) ?? 0) - 1);
      if (inDegree.get(succ) === 0) queue.push(succ);
    }
  }

  const earliestStart = new Map<string, number>();
  const earliestFinish = new Map<string, number>();
  for (const id of order) {
    const node = byId.get(id)!;
    const es = node.dependsOn.length ? Math.max(...node.dependsOn.map((d) => earliestFinish.get(d) ?? 0)) : 0;
    earliestStart.set(id, es);
    earliestFinish.set(id, es + node.durationDays);
  }
  const projectDurationDays = Math.max(0, ...order.map((id) => earliestFinish.get(id) ?? 0));

  const latestFinish = new Map<string, number>();
  const latestStart = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const node = byId.get(id)!;
    const succs = successors.get(id) ?? [];
    const lf = succs.length ? Math.min(...succs.map((s) => latestStart.get(s) ?? projectDurationDays)) : projectDurationDays;
    latestFinish.set(id, lf);
    latestStart.set(id, lf - node.durationDays);
  }

  const results: CpmResult[] = order.map((id) => {
    const es = earliestStart.get(id) ?? 0;
    const ef = earliestFinish.get(id) ?? 0;
    const ls = latestStart.get(id) ?? 0;
    const lf = latestFinish.get(id) ?? 0;
    const float = ls - es;
    return { id, earliestStart: es, earliestFinish: ef, latestStart: ls, latestFinish: lf, float, isCritical: float <= 0 };
  });

  const criticalPath = results.filter((r) => r.isCritical).map((r) => r.id);
  return { nodes: results, criticalPath, projectDurationDays, hasCycle: false };
}

export interface ScheduleRiskResult {
  completionDays: Distribution;
  hasCycle: boolean;
  samples: number[];
}

/** Fraction of Monte Carlo schedule-risk trials that finish at or before `deadlineDays`. */
export function probabilityOfOnTimeDelivery(result: ScheduleRiskResult, deadlineDays: number): number {
  if (!result.samples.length) return 0;
  return result.samples.filter((s) => s <= deadlineDays).length / result.samples.length;
}

/**
 * Monte Carlo schedule risk: each trial draws every milestone's duration
 * from a triangular distribution (low = 70% of estimate, mode = estimate,
 * high = durationP90Days or 140% of estimate), recomputes the longest path
 * through the DAG with those sampled durations, and returns the
 * distribution of total project completion days.
 */
export function simulateScheduleRisk(nodes: ProjectNode[], seed = 99, n = 2000): ScheduleRiskResult {
  const { hasCycle } = detectCycle(nodes);
  if (hasCycle || nodes.length === 0) return { completionDays: summarizeDistribution([0], seed), hasCycle, samples: [] };

  const rng = mulberry32(seed);
  const samples: number[] = [];

  // Precompute topo order once (durations don't affect graph shape).
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const inDegree0 = new Map(nodes.map((n) => [n.id, n.dependsOn.length]));
  const successors = new Map<string, string[]>();
  for (const n of nodes) for (const dep of n.dependsOn) {
    if (!successors.has(dep)) successors.set(dep, []);
    successors.get(dep)!.push(n.id);
  }
  const queue0 = nodes.filter((n) => n.dependsOn.length === 0).map((n) => n.id);
  const order: string[] = [];
  const inDegree = new Map(inDegree0);
  const q = [...queue0];
  while (q.length) {
    const id = q.shift()!;
    order.push(id);
    for (const succ of successors.get(id) ?? []) {
      inDegree.set(succ, (inDegree.get(succ) ?? 0) - 1);
      if (inDegree.get(succ) === 0) q.push(succ);
    }
  }

  function triangularSample(low: number, mode: number, high: number): number {
    const u = rng();
    const fc = (mode - low) / (high - low || 1);
    if (u < fc) return low + Math.sqrt(u * (high - low) * (mode - low));
    return high - Math.sqrt((1 - u) * (high - low) * (high - mode));
  }

  for (let i = 0; i < n; i++) {
    const finish = new Map<string, number>();
    for (const id of order) {
      const node = byId.get(id)!;
      const low = node.durationDays * 0.7;
      const high = node.durationP90Days ?? node.durationDays * 1.4;
      const duration = Math.max(0.1, triangularSample(low, node.durationDays, Math.max(high, node.durationDays)));
      const es = node.dependsOn.length ? Math.max(...node.dependsOn.map((d) => finish.get(d) ?? 0)) : 0;
      finish.set(id, es + duration);
    }
    samples.push(Math.max(0, ...order.map((id) => finish.get(id) ?? 0)));
  }

  return { completionDays: summarizeDistribution(samples, seed), hasCycle: false, samples };
}
