/**
 * criticalPath.ts — classical Critical Path Method (CPM) over a DAG of work
 * items, plus an optional PERT-style expected-duration input
 * (optimistic/likely/pessimistic -> beta-approximation mean & variance).
 * Used by `executionEngine.ts` to produce a deterministic baseline schedule
 * which the Monte Carlo / discrete-event layer then perturbs stochastically.
 */

export interface CPMTask {
  id: string;
  durationDays: number;
  dependsOn: string[];
}

export interface CPMResult {
  earliestStart: Record<string, number>;
  earliestFinish: Record<string, number>;
  latestStart: Record<string, number>;
  latestFinish: Record<string, number>;
  slack: Record<string, number>;
  criticalPath: string[];
  projectDurationDays: number;
}

function topoSort(tasks: CPMTask[]): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const temp = new Set<string>();
  const order: string[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    if (temp.has(id)) throw new Error(`Cycle detected in task graph at '${id}'`);
    temp.add(id);
    const t = byId.get(id);
    if (t) for (const dep of t.dependsOn) visit(dep);
    temp.delete(id);
    visited.add(id);
    order.push(id);
  }

  for (const t of tasks) visit(t.id);
  return order;
}

export function computeCriticalPath(tasks: CPMTask[]): CPMResult {
  if (tasks.length === 0) {
    return {
      earliestStart: {},
      earliestFinish: {},
      latestStart: {},
      latestFinish: {},
      slack: {},
      criticalPath: [],
      projectDurationDays: 0,
    };
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const order = topoSort(tasks);

  const earliestStart: Record<string, number> = {};
  const earliestFinish: Record<string, number> = {};
  for (const id of order) {
    const t = byId.get(id)!;
    const es = t.dependsOn.length === 0 ? 0 : Math.max(...t.dependsOn.map((d) => earliestFinish[d] ?? 0));
    earliestStart[id] = es;
    earliestFinish[id] = es + t.durationDays;
  }

  const projectDurationDays = Math.max(0, ...Object.values(earliestFinish));

  const successors = new Map<string, string[]>();
  for (const t of tasks) {
    for (const dep of t.dependsOn) {
      const arr = successors.get(dep) ?? [];
      arr.push(t.id);
      successors.set(dep, arr);
    }
  }

  const latestFinish: Record<string, number> = {};
  const latestStart: Record<string, number> = {};
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const t = byId.get(id)!;
    const succ = successors.get(id) ?? [];
    const lf = succ.length === 0 ? projectDurationDays : Math.min(...succ.map((s) => latestStart[s] ?? projectDurationDays));
    latestFinish[id] = lf;
    latestStart[id] = lf - t.durationDays;
  }

  const slack: Record<string, number> = {};
  const criticalPath: string[] = [];
  for (const id of order) {
    const s = latestStart[id] - earliestStart[id];
    slack[id] = s;
    if (Math.abs(s) < 1e-9) criticalPath.push(id);
  }

  return { earliestStart, earliestFinish, latestStart, latestFinish, slack, criticalPath, projectDurationDays };
}

/** PERT three-point estimate -> (mean, variance) via the standard beta approximation. */
export function pertEstimate(optimistic: number, mostLikely: number, pessimistic: number) {
  const mean = (optimistic + 4 * mostLikely + pessimistic) / 6;
  const stdDev = (pessimistic - optimistic) / 6;
  return { mean, stdDev, variance: stdDev * stdDev };
}
