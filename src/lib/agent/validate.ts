// LEADOS Agent Kernel — plan validation.
//
// Two independent gates, both must pass before any node executes:
//   1. Schema validation: `PlanGraphSchema.safeParse`.
//   2. Structural validation: unique node ids, dependsOn references resolve,
//      graph is a DAG (Kahn's algorithm — a cycle exists iff topological
//      sort cannot consume all nodes), and the plan's own cost/time
//      estimates do not already exceed the declared budget.
//
// A plan that fails either gate is REJECTED and never reaches the executor.
// Callers must log every rejection (orchestrator.ts increments a counter so
// "zero invalid plans executed" is measurable in PHASE 4).
import { PlanGraphSchema, type PlanGraph, type PlanValidationResult } from "./types";

export function topologicalOrderKahn(
  nodeIds: string[],
  edges: Array<[string, string]> // [from=dependency, to=dependent]
): { order: string[]; hasCycle: boolean } {
  const inDegree = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const adjacency = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  for (const [from, to] of edges) {
    if (!adjacency.has(from) || !inDegree.has(to)) continue;
    adjacency.get(from)!.push(to);
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const [id, deg] of inDegree) if (deg === 0) queue.push(id);
  queue.sort();
  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    const next = (adjacency.get(current) ?? []).slice().sort();
    for (const n of next) {
      inDegree.set(n, (inDegree.get(n) ?? 0) - 1);
      if (inDegree.get(n) === 0) queue.push(n);
    }
    queue.sort();
  }
  return { order, hasCycle: order.length !== nodeIds.length };
}

export function validatePlanGraph(plan: unknown): PlanValidationResult {
  const errors: string[] = [];
  const parsed = PlanGraphSchema.safeParse(plan);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`schema: ${issue.path.join(".")}: ${issue.message}`);
    }
    return { valid: false, errors };
  }
  const graph: PlanGraph = parsed.data;

  const ids = graph.root.map((n) => n.id);
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) {
    errors.push("structural: duplicate node ids in root");
  }

  const edges: Array<[string, string]> = [];
  for (const node of graph.root) {
    for (const dep of node.dependsOn) {
      if (!idSet.has(dep)) {
        errors.push(`structural: node ${node.id} depends on unknown node ${dep}`);
        continue;
      }
      edges.push([dep, node.id]);
    }
  }

  if (errors.length === 0) {
    const { hasCycle } = topologicalOrderKahn(ids, edges);
    if (hasCycle) {
      errors.push("structural: plan graph contains a cycle (Kahn's algorithm found unreachable nodes)");
    }
  }

  const totalCost = graph.root.reduce((sum, n) => sum + n.estCostUsd, 0);
  const totalMin = graph.root.reduce((sum, n) => sum + n.estMin, 0);
  if (totalCost > graph.budgetUsd) {
    errors.push(
      `budget: estimated cost ${totalCost.toFixed(4)} exceeds budgetUsd ${graph.budgetUsd.toFixed(4)}`
    );
  }
  if (totalMin > graph.budgetMin) {
    errors.push(`budget: estimated minutes ${totalMin.toFixed(2)} exceeds budgetMin ${graph.budgetMin}`);
  }

  return { valid: errors.length === 0, errors };
}
