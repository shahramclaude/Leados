export type MetricReading = {
  name: string;
  actual: number;
  baseline: number;
  stdDev: number;
};

export type ScenarioUrgency = "monitor" | "prepare" | "act";

export type ScenarioActivation = {
  metric: string;
  deviationInStdDevs: number;
  urgency: ScenarioUrgency;
};

/** 3+ std devs away from baseline => immediate action. */
export function evaluateScenarioActivation(reading: MetricReading): ScenarioActivation {
  const std = reading.stdDev === 0 ? 1 : reading.stdDev;
  const deviation = Math.abs(reading.actual - reading.baseline) / std;
  let urgency: ScenarioUrgency = "monitor";
  if (deviation >= 3) urgency = "act";
  else if (deviation >= 1.5) urgency = "prepare";
  return { metric: reading.name, deviationInStdDevs: deviation, urgency };
}

export type WarGameMove = { round: number; actor: "us" | "competitor"; action: string };

export type WarGameResult = {
  completed: boolean;
  rounds: number;
  moves: WarGameMove[];
  durationMs: number;
};

/** Fixed-round simulation — never recurses, always terminates. */
export function runWarGame(rounds = 10): WarGameResult {
  const started = Date.now();
  const moves: WarGameMove[] = [];
  const actions = ["price_cut", "feature_launch", "marketing_push", "partnership", "hold"];
  for (let r = 0; r < rounds; r++) {
    moves.push({ round: r, actor: "us", action: actions[r % actions.length] });
    moves.push({ round: r, actor: "competitor", action: actions[(r + 2) % actions.length] });
  }
  return { completed: true, rounds, moves, durationMs: Date.now() - started };
}

export type ProjectNode = {
  id: number;
  name: string;
  durationDays: number;
  dependencies: number[]; // ids this project depends on (must finish first)
};

export type CriticalPathResult = {
  order: number[]; // topological order
  chain: number[]; // the longest-duration path (the critical path)
  totalDurationDays: number;
  bottleneckProject: number | null;
  cyclesDetected: number[][];
};

/** Kahn's algorithm for topological sort; always terminates on any graph. */
function kahnTopologicalSort(nodes: ProjectNode[]): { order: number[]; hasCycle: boolean } {
  const idToNode = new Map(nodes.map((n) => [n.id, n]));
  const inDegree = new Map<number, number>();
  const adjacency = new Map<number, number[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adjacency.set(n.id, []);
  }
  for (const n of nodes) {
    for (const dep of n.dependencies) {
      if (!idToNode.has(dep)) continue;
      adjacency.get(dep)!.push(n.id);
      inDegree.set(n.id, (inDegree.get(n.id) ?? 0) + 1);
    }
  }

  const queue: number[] = [];
  for (const [id, deg] of inDegree) if (deg === 0) queue.push(id);

  const order: number[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adjacency.get(id) ?? []) {
      inDegree.set(next, (inDegree.get(next) ?? 0) - 1);
      if (inDegree.get(next) === 0) queue.push(next);
    }
  }

  return { order, hasCycle: order.length !== nodes.length };
}

/** DFS-based cycle detection with a recursion stack — returns every distinct cycle found. */
export function detectCycles(nodes: ProjectNode[]): number[][] {
  const adjacency = new Map<number, number[]>();
  for (const n of nodes) adjacency.set(n.id, []);
  for (const n of nodes) {
    for (const dep of n.dependencies) {
      // edge dep -> n (dep must happen before n)
      if (adjacency.has(dep)) adjacency.get(dep)!.push(n.id);
    }
  }

  const visited = new Set<number>();
  const stack = new Set<number>();
  const path: number[] = [];
  const cycles: number[][] = [];

  function dfs(id: number) {
    visited.add(id);
    stack.add(id);
    path.push(id);
    for (const next of adjacency.get(id) ?? []) {
      if (!visited.has(next)) {
        dfs(next);
      } else if (stack.has(next)) {
        const startIdx = path.indexOf(next);
        if (startIdx !== -1) cycles.push(path.slice(startIdx));
      }
    }
    stack.delete(id);
    path.pop();
  }

  for (const n of nodes) if (!visited.has(n.id)) dfs(n.id);
  return cycles;
}

export function buildCriticalPath(nodes: ProjectNode[]): CriticalPathResult {
  const cyclesDetected = detectCycles(nodes);
  const { order } = kahnTopologicalSort(nodes);
  const idToNode = new Map(nodes.map((n) => [n.id, n]));

  // Longest path (by duration) through the DAG using the topological order.
  const longestEndingAt = new Map<number, { length: number; path: number[] }>();
  for (const id of order) {
    const node = idToNode.get(id)!;
    let best = { length: node.durationDays, path: [id] };
    for (const dep of node.dependencies) {
      const prev = longestEndingAt.get(dep);
      if (prev && prev.length + node.durationDays > best.length) {
        best = { length: prev.length + node.durationDays, path: [...prev.path, id] };
      }
    }
    longestEndingAt.set(id, best);
  }

  let chain: number[] = [];
  let totalDurationDays = 0;
  for (const { length, path } of longestEndingAt.values()) {
    if (length > totalDurationDays) {
      totalDurationDays = length;
      chain = path;
    }
  }

  let bottleneckProject: number | null = null;
  let maxDuration = -Infinity;
  for (const id of chain) {
    const d = idToNode.get(id)?.durationDays ?? 0;
    if (d > maxDuration) {
      maxDuration = d;
      bottleneckProject = id;
    }
  }

  return { order, chain, totalDurationDays, bottleneckProject, cyclesDetected };
}

export type DecisionBranch = {
  label: string;
  outcome: string;
  expectedValue: number;
};

export type DecisionTree = {
  decision: string;
  domain: string;
  branches: DecisionBranch[];
};

const DOMAIN_BRANCH_TEMPLATES: Record<string, DecisionBranch[]> = {
  people: [
    { label: "Promote internally", outcome: "retain institutional knowledge", expectedValue: 0.7 },
    { label: "Hire externally", outcome: "fresh perspective, ramp-up risk", expectedValue: 0.5 },
    { label: "Do nothing", outcome: "status quo, flight risk persists", expectedValue: 0.2 },
  ],
  financial: [
    { label: "Raise now", outcome: "dilution but extended runway", expectedValue: 0.65 },
    { label: "Extend runway via cuts", outcome: "preserve equity, slower growth", expectedValue: 0.55 },
    { label: "Wait", outcome: "risk of running out of cash", expectedValue: 0.25 },
  ],
  strategic: [
    { label: "Expand market", outcome: "higher growth, higher risk", expectedValue: 0.6 },
    { label: "Consolidate", outcome: "protect core, slower growth", expectedValue: 0.5 },
  ],
  default: [
    { label: "Act now", outcome: "address issue directly", expectedValue: 0.6 },
    { label: "Monitor", outcome: "gather more data before acting", expectedValue: 0.4 },
  ],
};

export function autoGenerateDecisionTree(domain: string, decision: string): DecisionTree {
  const branches = DOMAIN_BRANCH_TEMPLATES[domain] ?? DOMAIN_BRANCH_TEMPLATES.default;
  return { decision, domain, branches: branches.map((b) => ({ ...b })) };
}
