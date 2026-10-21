// C. Critical path method (CPM) with float — pure, deterministic graph math.
// Used both for the "today's plan" critical path view and, sampled many times,
// as the engine behind delivery.ts's Monte Carlo delivery-date distribution.

export type CpmNode = { id: number; duration: number; dependsOn: number[] };

export type CpmResult = {
  finish: number;
  schedule: Record<number, { ES: number; EF: number; LS: number; LF: number; float: number; critical: boolean }>;
  criticalPath: number[];
};

export function computeCPM(nodes: CpmNode[]): CpmResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ES = new Map<number, number>();
  const EF = new Map<number, number>();

  // Forward pass — topological by `dependsOn` since sequence ids are monotonic in seed data,
  // but we resolve generically via repeated relaxation to stay correct for any ordering.
  const order = topoSort(nodes);
  for (const id of order) {
    const n = byId.get(id)!;
    const es = n.dependsOn.length === 0 ? 0 : Math.max(...n.dependsOn.map((d) => EF.get(d) ?? 0));
    ES.set(id, es);
    EF.set(id, es + n.duration);
  }

  const finish = Math.max(0, ...[...EF.values()]);

  const hasSuccessor = new Set<number>();
  for (const n of nodes) for (const d of n.dependsOn) hasSuccessor.add(d);

  const LF = new Map<number, number>();
  const LS = new Map<number, number>();
  for (const id of [...order].reverse()) {
    const n = byId.get(id)!;
    const successors = nodes.filter((m) => m.dependsOn.includes(id));
    const lf = successors.length === 0 ? finish : Math.min(...successors.map((s) => LS.get(s.id) ?? finish));
    LF.set(id, lf);
    LS.set(id, lf - n.duration);
  }

  const schedule: CpmResult["schedule"] = {};
  const criticalPath: number[] = [];
  for (const n of nodes) {
    const es = ES.get(n.id)!;
    const ef = EF.get(n.id)!;
    const ls = LS.get(n.id)!;
    const lf = LF.get(n.id)!;
    const float = round(ls - es);
    const critical = float <= 0.0001;
    schedule[n.id] = { ES: es, EF: ef, LS: ls, LF: lf, float, critical };
    if (critical) criticalPath.push(n.id);
  }

  return { finish, schedule, criticalPath };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

function topoSort(nodes: CpmNode[]): number[] {
  const visited = new Set<number>();
  const order: number[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  function visit(id: number, stack: Set<number>) {
    if (visited.has(id)) return;
    if (stack.has(id)) return; // cycle guard — treat as resolved to avoid infinite loop
    stack.add(id);
    const n = byId.get(id);
    if (n) for (const d of n.dependsOn) visit(d, stack);
    stack.delete(id);
    visited.add(id);
    order.push(id);
  }

  for (const n of nodes) visit(n.id, new Set());
  return order;
}
