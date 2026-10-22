// ---------------------------------------------------------------------------
// src/lib/financeDag.ts
//
// Stand-in for Part 08's finance model DAG engine, reused here (not forked)
// for the carbon calculation chain: activity -> factor lookup -> emission ->
// aggregation. The contract is deliberately the same shape a finance
// calculation DAG would use: typed nodes, explicit dependency edges,
// topological execution, and every node output is an Explain<T> so
// provenance survives aggregation.
// ---------------------------------------------------------------------------
import { Explain } from "./evidence";

export interface DagNode<Id extends string = string> {
  id: Id;
  deps: Id[];
  compute: (inputs: Record<string, Explain<number>>) => Explain<number>;
}

export class DagCycleError extends Error {
  constructor(id: string) {
    super(`Cycle detected in calculation DAG at node "${id}"`);
  }
}

/** Topologically sort and execute a DAG of calculation nodes, returning every node's result. */
export function runDag(nodes: DagNode[]): Map<string, Explain<number>> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const results = new Map<string, Explain<number>>();
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new DagCycleError(id);
    const node = byId.get(id);
    if (!node) throw new Error(`Unknown DAG node referenced as a dependency: "${id}"`);
    visiting.add(id);
    for (const dep of node.deps) visit(dep);
    visiting.delete(id);
    visited.add(id);

    const inputs: Record<string, Explain<number>> = {};
    for (const dep of node.deps) {
      const r = results.get(dep);
      if (!r) throw new Error(`Dependency "${dep}" for node "${id}" did not produce a result`);
      inputs[dep] = r;
    }
    results.set(id, node.compute(inputs));
  }

  for (const node of nodes) visit(node.id);
  return results;
}

/**
 * Exact two-factor decomposition identity, the same shape used by Part 08's
 * finance variance decomposition: splits the change between a "baseline"
 * and "current" state of (quantity x rate) into a volume effect and a
 * rate effect that sum exactly back to the total variance.
 *
 *   total   = current.qty * current.rate - baseline.qty * baseline.rate
 *   volume  = (current.qty - baseline.qty) * baseline.rate
 *   rate    = (current.rate - baseline.rate) * current.qty
 *   volume + rate === total   (exact identity, tested)
 */
export interface DecompositionInput {
  qty: number;
  rate: number;
}

export interface DecompositionResult {
  total: number;
  volumeEffect: number;
  rateEffect: number;
  /** Residual should be ~0; kept explicit so the reconciliation test can assert on it directly. */
  residual: number;
}

export function decomposeTwoFactor(baseline: DecompositionInput, current: DecompositionInput): DecompositionResult {
  const baselineTotal = baseline.qty * baseline.rate;
  const currentTotal = current.qty * current.rate;
  const total = currentTotal - baselineTotal;
  const volumeEffect = (current.qty - baseline.qty) * baseline.rate;
  const rateEffect = (current.rate - baseline.rate) * current.qty;
  const residual = total - (volumeEffect + rateEffect);
  return { total, volumeEffect, rateEffect, residual };
}
