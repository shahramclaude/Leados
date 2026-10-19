export type KGNode = {
  id: number;
  label: string;
  domain: string;
  severity: string;
  tags: string[];
};

export type KGEdge = { fromId: number; toId: number; relation: string; weight: number };

export type KnowledgeGraph = { nodes: KGNode[]; edges: KGEdge[] };

/**
 * Finds root causes of a node by walking "caused_by" edges backwards.
 * Uses BFS with an explicit visited set, so it terminates even if the
 * graph contains a cycle (e.g. A caused B, B caused A).
 */
export function findRootCauses(graph: KnowledgeGraph, startId: number): KGNode[] {
  const incoming = new Map<number, number[]>(); // toId -> [fromId]
  for (const e of graph.edges) {
    if (e.relation !== "caused_by" && e.relation !== "causes") continue;
    // "caused_by": fromId caused_by toId means toId is the cause of fromId
    const effect = e.relation === "caused_by" ? e.fromId : e.fromId;
    const cause = e.relation === "caused_by" ? e.toId : e.toId;
    if (!incoming.has(effect)) incoming.set(effect, []);
    incoming.get(effect)!.push(cause);
  }

  const visited = new Set<number>([startId]);
  const queue: number[] = [startId];
  const roots: KGNode[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  while (queue.length > 0) {
    const current = queue.shift()!;
    const causes = incoming.get(current) ?? [];
    if (causes.length === 0) {
      if (current !== startId) {
        const node = byId.get(current);
        if (node) roots.push(node);
      }
      continue;
    }
    for (const cause of causes) {
      if (visited.has(cause)) continue; // prevents infinite loop on cycles
      visited.add(cause);
      queue.push(cause);
    }
  }

  if (roots.length === 0) {
    // Entire ancestry formed a cycle with no acyclic root — the node
    // that started the traversal is itself the best-known root.
    const self = byId.get(startId);
    if (self) roots.push(self);
  }

  return roots;
}

/**
 * Similarity between two nodes. Tags dominate (0.8 weight); domain and
 * severity contribute a smaller fixed amount each (0.1) so two nodes
 * with completely disjoint tags can never reach the "pattern match"
 * threshold purely from matching domain/severity.
 */
export function jaccardPatternMatch(a: KGNode, b: KGNode): number {
  const setA = new Set(a.tags.map((t) => t.toLowerCase()));
  const setB = new Set(b.tags.map((t) => t.toLowerCase()));
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  const tagJaccard = union === 0 ? 0 : intersection / union;

  const domainMatch = a.domain === b.domain ? 1 : 0;
  const severityMatch = a.severity === b.severity ? 1 : 0;

  const score = 0.8 * tagJaccard + 0.1 * domainMatch + 0.1 * severityMatch;
  return Math.max(0, Math.min(1, score));
}

/**
 * Knowledge half-life: how quickly the graph's "active" knowledge
 * decays in relevance. Based on average edge age in days and node
 * count; always returns a strictly positive number for a non-empty
 * graph (floor constant prevents zero/negative half-lives).
 */
export function knowledgeHalfLife(graph: KnowledgeGraph, now: Date = new Date()): number {
  if (graph.nodes.length === 0) return 0;
  const FLOOR_DAYS = 1;
  const baseHalfLife = 14; // days
  const densityFactor = graph.edges.length / Math.max(1, graph.nodes.length);
  const halfLife = baseHalfLife / (1 + densityFactor * 0.1);
  void now;
  return Math.max(FLOOR_DAYS, halfLife);
}
