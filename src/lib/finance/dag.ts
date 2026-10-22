// Part 08 — Model DAG engine.
// Typed nodes (driver | formula | constant), topological evaluation,
// memoized by a deterministic hash of (node definitions, months, overrides),
// with confidence propagation: a formula node's confidence at month i is the
// worst (least-trusted) confidence among its dependencies at month i. That
// is how "asserted" (hand-typed) driver overrides visibly flow all the way
// through to revenue, EBITDA, cash, etc. without extra bookkeeping.

import { ConfidenceClass, CONFIDENCE_RANK } from "./types";

export type NodeType = "constant" | "driver" | "formula";

export interface EvalContext {
  months: string[];
  get(id: string): number[];
  getConfidence(id: string): ConfidenceClass[];
}

export interface DagNodeDef {
  id: string;
  label: string;
  type: NodeType;
  /** UI grouping for the Driver Tree (e.g. "revenue", "headcount", "cost", "statement"). */
  group: string;
  unit?: "usd" | "pct" | "count" | "months" | "ratio" | "days";
  deps: string[];
  compute: (ctx: EvalContext) => number[];
  /** Override automatic confidence propagation (rare — e.g. constants that
   * represent board-asserted assumptions). */
  confidence?: (ctx: EvalContext, values: number[]) => ConfidenceClass[];
  description?: string;
  /** Relative std-dev (fraction of value) applied by Monte Carlo when this
   * driver's FORECAST portion is perturbed. Ignored for history indices. */
  relUncertainty?: number;
}

export interface EvaluatedNode {
  id: string;
  label: string;
  type: NodeType;
  group: string;
  unit?: DagNodeDef["unit"];
  values: number[];
  confidence: ConfidenceClass[];
  description?: string;
}

export interface EvaluatedModel {
  hash: string;
  months: string[];
  nodes: Record<string, EvaluatedNode>;
  order: string[];
  evalMs: number;
}

export interface OverrideMap {
  [driverId: string]: { [monthIndex: number]: number };
}

function topoSort(nodes: DagNodeDef[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const order: string[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Finance DAG cycle detected at node "${id}"`);
    }
    const node = byId.get(id);
    if (!node) throw new Error(`Finance DAG references unknown node "${id}"`);
    visiting.add(id);
    for (const dep of node.deps) visit(dep);
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  }

  for (const n of nodes) visit(n.id);
  return order;
}

/** Deterministic, dependency-free string hash (FNV-1a). Fingerprints a model
 * definition + inputs for memoization and model versioning. Not cryptographic. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const evalCache = new Map<string, EvaluatedModel>();

export function evaluateDag(
  nodes: DagNodeDef[],
  months: string[],
  overrides: OverrideMap = {},
  opts: { cache?: boolean } = {},
): EvaluatedModel {
  const useCache = opts.cache !== false;
  const defHash = fnv1a(nodes.map((n) => `${n.id}|${n.type}|${n.deps.join(",")}`).join(";"));
  const overrideHash = fnv1a(JSON.stringify(overrides));
  const cacheKey = `${defHash}:${months.length}:${months[0] ?? ""}:${overrideHash}`;
  if (useCache) {
    const cached = evalCache.get(cacheKey);
    if (cached) return cached;
  }

  const start = performance.now();
  const order = topoSort(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const values = new Map<string, number[]>();
  const confidences = new Map<string, ConfidenceClass[]>();

  for (const id of order) {
    const node = byId.get(id)!;
    const ctx: EvalContext = {
      months,
      get: (depId: string) => {
        const v = values.get(depId);
        if (!v) throw new Error(`Finance DAG: "${id}" requested unevaluated dep "${depId}"`);
        return v;
      },
      getConfidence: (depId: string) => confidences.get(depId) ?? [],
    };

    let series = node.compute(ctx);
    const driverOverrides = node.type === "driver" ? overrides[id] : undefined;
    if (driverOverrides) {
      series = series.map((v, i) => (driverOverrides[i] !== undefined ? driverOverrides[i] : v));
    }

    let conf: ConfidenceClass[];
    if (node.confidence) {
      conf = node.confidence(ctx, series);
    } else if (node.type === "constant") {
      conf = series.map(() => "evidence" as ConfidenceClass);
    } else if (node.type === "formula") {
      conf = months.map((_, i) => {
        let worst: ConfidenceClass = "evidence";
        let worstRank = 0;
        for (const dep of node.deps) {
          const depConf = confidences.get(dep)?.[i] ?? "evidence";
          const r = CONFIDENCE_RANK[depConf];
          if (r > worstRank) {
            worstRank = r;
            worst = depConf;
          }
        }
        return worst;
      });
    } else {
      // driver with no explicit confidence fn: default to "forecast"
      conf = series.map(() => "forecast" as ConfidenceClass);
    }

    if (driverOverrides) {
      conf = conf.map((c, i) => (driverOverrides[i] !== undefined ? "asserted" : c));
    }

    values.set(id, series);
    confidences.set(id, conf);
  }

  const resultNodes: Record<string, EvaluatedNode> = {};
  for (const id of order) {
    const node = byId.get(id)!;
    resultNodes[id] = {
      id,
      label: node.label,
      type: node.type,
      group: node.group,
      unit: node.unit,
      values: values.get(id)!,
      confidence: confidences.get(id)!,
      description: node.description,
    };
  }

  const evalMs = performance.now() - start;
  const result: EvaluatedModel = {
    hash: `${defHash}-${overrideHash}`,
    months,
    nodes: resultNodes,
    order,
    evalMs,
  };
  if (useCache) evalCache.set(cacheKey, result);
  return result;
}

export function clearDagCache(): void {
  evalCache.clear();
}

export function cacheSize(): number {
  return evalCache.size;
}

/** Merges two override maps; entries in `override` win over `base`. Used to
 * layer ephemeral what-if overrides (request body) on top of persisted
 * asserted overrides (DB) without mutating either. */
export function mergeOverrides(base: OverrideMap, override: OverrideMap): OverrideMap {
  const result: OverrideMap = {};
  for (const key of Object.keys(base)) result[key] = { ...base[key] };
  for (const key of Object.keys(override)) result[key] = { ...(result[key] ?? {}), ...override[key] };
  return result;
}
