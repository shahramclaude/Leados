// src/lib/intelligence/causal.ts
//
// Core causal graph types shared by causalInference.ts, causalChain.ts and
// scenarioEngine.ts. The graph is a DAG of named variables with directed
// edges; edges may be marked `confounded` when we know (from domain
// knowledge, not statistics) that an unmeasured common cause might exist.
export interface CausalNode {
  id: string;
  label: string;
  /** unit of the variable, for display only */
  unit?: string;
}

export interface CausalEdge {
  from: string;
  to: string;
  /** sign of the believed effect; magnitude is estimated, not assumed */
  sign: "positive" | "negative" | "ambiguous";
  /** true when we know of a plausible unmeasured confounder of this edge */
  suspectedConfounder?: string;
}

export interface CausalGraph {
  id: string;
  label: string;
  nodes: CausalNode[];
  edges: CausalEdge[];
}

export function parents(graph: CausalGraph, nodeId: string): string[] {
  return graph.edges.filter((e) => e.to === nodeId).map((e) => e.from);
}

export function children(graph: CausalGraph, nodeId: string): string[] {
  return graph.edges.filter((e) => e.from === nodeId).map((e) => e.to);
}

/** All directed paths from `fromId` to `toId` (simple paths, no cycles since
 * the graph is a DAG). Used by causalChain.ts to render propagation. */
export function directedPaths(graph: CausalGraph, fromId: string, toId: string): string[][] {
  const paths: string[][] = [];
  const visit = (current: string, path: string[]) => {
    if (current === toId) {
      paths.push([...path, current]);
      return;
    }
    for (const next of children(graph, current)) {
      if (path.includes(next)) continue; // guard against accidental cycles
      visit(next, [...path, current]);
    }
  };
  visit(fromId, []);
  return paths;
}

/** The example causal graph for GTM operations, used by causalInference.ts
 * demos, causalChain.ts, and scenarioEngine.ts. Documented assumptions live
 * next to each confounded edge. */
export function buildGtmCausalGraph(): CausalGraph {
  return {
    id: "gtm-core",
    label: "GTM operations causal graph",
    nodes: [
      { id: "headcount", label: "Sales headcount", unit: "reps" },
      { id: "pipelineGenerated", label: "Pipeline generated", unit: "$" },
      { id: "dealCycleLength", label: "Deal cycle length", unit: "days" },
      { id: "winRate", label: "Win rate", unit: "ratio" },
      { id: "revenue", label: "Revenue", unit: "$" },
      { id: "price", label: "List price", unit: "$" },
      { id: "marketDemand", label: "Market demand (unmeasured)", unit: "index" },
    ],
    edges: [
      { from: "headcount", to: "pipelineGenerated", sign: "positive" },
      { from: "pipelineGenerated", to: "revenue", sign: "positive" },
      { from: "price", to: "winRate", sign: "negative" },
      { from: "winRate", to: "revenue", sign: "positive" },
      { from: "dealCycleLength", to: "revenue", sign: "negative" },
      // marketDemand is a common cause of both hiring decisions (companies
      // hire more reps when demand is hot) and pipeline generation, which
      // makes it a classic confounder of the headcount -> pipelineGenerated
      // relationship. It is usually NOT directly measured, which is exactly
      // why causalInference.ts must refuse to call that link causal unless
      // the caller supplies market-demand data.
      { from: "marketDemand", to: "headcount", sign: "positive" },
      { from: "marketDemand", to: "pipelineGenerated", sign: "positive" },
      { from: "marketDemand", to: "winRate", sign: "positive" },
    ],
  };
}
