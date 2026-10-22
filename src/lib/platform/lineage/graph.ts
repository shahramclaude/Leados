// src/lib/platform/lineage/graph.ts
//
// Pure, DB-agnostic lineage graph helpers. Four node types model the
// mandated chain: source -> transform -> projection -> surface. Every
// derived value shown on a surface must be reachable back to a source node,
// or the lineage query says so explicitly (never silently assumes a path).
export type LineageNodeType = "source" | "transform" | "projection" | "surface";

export interface LineageNode {
  id: string;
  nodeType: LineageNodeType;
  refTable: string | null;
  refId: string | null;
  label: string;
  metadata?: Record<string, unknown>;
}

export interface LineageEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

export interface LineageChain {
  nodes: LineageNode[]; // ordered source -> ... -> surface
}

export interface LineageTraceResult {
  found: boolean;
  chains: LineageChain[];
  explanation: string;
}

/**
 * Given the full node/edge set (already scoped to the relevant entity),
 * walks forward from every `source` node to every `surface` node and returns
 * each distinct path as a chain. Pure function — no DB access — so it is
 * unit-testable with synthetic graphs.
 */
export function traceLineage(nodes: LineageNode[], edges: LineageEdge[]): LineageTraceResult {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const outEdges = new Map<string, string[]>();
  for (const e of edges) {
    if (!outEdges.has(e.fromNodeId)) outEdges.set(e.fromNodeId, []);
    outEdges.get(e.fromNodeId)!.push(e.toNodeId);
  }

  const sources = nodes.filter((n) => n.nodeType === "source");
  if (sources.length === 0) {
    return { found: false, chains: [], explanation: "No source node found for this value." };
  }

  const chains: LineageChain[] = [];

  function dfs(path: LineageNode[], currentId: string) {
    const current = nodeById.get(currentId);
    if (!current) return;
    const nextPath = [...path, current];
    if (current.nodeType === "surface") {
      chains.push({ nodes: nextPath });
      return;
    }
    const next = outEdges.get(currentId) ?? [];
    if (next.length === 0) {
      // Incomplete chain (e.g. projection never rendered on a surface yet) — still
      // surfaced, flagged as incomplete, never silently dropped.
      chains.push({ nodes: nextPath });
      return;
    }
    for (const n of next) dfs(nextPath, n);
  }

  for (const s of sources) dfs([], s.id);

  const reachedSurface = chains.some((c) => c.nodes[c.nodes.length - 1]?.nodeType === "surface");
  return {
    found: chains.length > 0,
    chains,
    explanation: reachedSurface
      ? `Resolved ${chains.length} path(s) from source to surface.`
      : chains.length > 0
        ? "Found a partial chain that does not yet reach a surface node (value has not been rendered anywhere)."
        : "No lineage chain could be constructed from the available nodes/edges.",
  };
}
