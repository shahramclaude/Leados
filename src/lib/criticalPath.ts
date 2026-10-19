export interface ProjectNode {
  id: string;
  durationDays: number;
  /** IDs of nodes that must complete before this node can start. */
  dependsOn: string[];
}

export interface CycleDetectionResult {
  hasCycle: boolean;
  cycle: string[];
}

/**
 * Directed-graph cycle detection via iterative-safe DFS with a 3-color
 * (unvisited / visiting / done) state table. Guaranteed to terminate because
 * every node transitions unvisited -> visiting -> done at most once; a node
 * found in the "visiting" state immediately short-circuits as a cycle
 * instead of recursing again, so it can never hang on a cyclic graph.
 */
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
      if (depState === 0 && graph.has(dep) && visit(dep)) {
        return true;
      }
    }
    stack.pop();
    state.set(id, 2);
    return false;
  }

  for (const n of nodes) {
    if ((state.get(n.id) ?? 0) === 0) {
      if (visit(n.id)) {
        return { hasCycle: true, cycle };
      }
    }
  }

  return { hasCycle: false, cycle: [] };
}

/**
 * Longest-path (critical path) through a DAG of projects, by total duration.
 * Returns an ordered list of project IDs with no duplicates. If the graph is
 * cyclic, returns an empty array rather than looping forever.
 */
export function computeCriticalPath(nodes: ProjectNode[]): string[] {
  if (nodes.length === 0) return [];
  const { hasCycle } = detectCycle(nodes);
  if (hasCycle) return [];

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, { length: number; path: string[] }>();

  function longestPathEndingAt(id: string): { length: number; path: string[] } {
    const cached = memo.get(id);
    if (cached) return cached;
    const node = byId.get(id);
    if (!node) {
      const empty = { length: 0, path: [] as string[] };
      memo.set(id, empty);
      return empty;
    }
    let best = { length: node.durationDays, path: [id] };
    for (const dep of node.dependsOn) {
      const sub = longestPathEndingAt(dep);
      const candidateLength = sub.length + node.durationDays;
      if (candidateLength > best.length) {
        best = { length: candidateLength, path: [...sub.path, id] };
      }
    }
    memo.set(id, best);
    return best;
  }

  let overallBest = { length: 0, path: [] as string[] };
  for (const n of nodes) {
    const candidate = longestPathEndingAt(n.id);
    if (candidate.length > overallBest.length) overallBest = candidate;
  }
  return overallBest.path;
}
