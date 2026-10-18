// src/lib/knowledgeGraph.ts
// -----------------------------------------------------------------------
// LEADOS Part 9 — Knowledge Graph Engine.
//
// This is the core institutional-memory layer: every person, decision,
// metric, finding, event, playbook and insight in the organization is a
// node; every causal/informational relationship between them is an edge.
// The engine lets the rest of the app answer "why did we do X?" and
// "what led to Y?" purely by walking the graph that already exists in the
// database — no manual documentation required.
// -----------------------------------------------------------------------
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  leadosMemoryNodes,
  leadosMemoryEdges,
  type LeadosMemoryNode,
  type LeadosMemoryEdge,
} from "@/db/schema";

export type NodeType =
  | "person"
  | "decision"
  | "metric"
  | "event"
  | "finding"
  | "playbook"
  | "insight"
  | "domain"; // pragmatic extension: domains are the connective tissue between every other node type

export type RelationType =
  | "caused"
  | "informed"
  | "resolved"
  | "escalated"
  | "blocked"
  | "created"
  | "modified"
  | "triggered";

export type MemoryNode = LeadosMemoryNode;
export type MemoryEdge = LeadosMemoryEdge;

export interface GraphSubgraph {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
}

export interface RelatedEntity {
  node: MemoryNode;
  combinedWeight: number;
  hops: number;
  relations: RelationType[];
}

export interface Pattern {
  id: string;
  type: "cycle" | "chain" | "cluster" | "isolated_critical";
  nodeIds: number[];
  edgeIds: number[];
  nodeLabels: string[];
  severity: "low" | "medium" | "high";
  description: string;
}

export interface Insight {
  type: "pattern" | "anomaly" | "prediction" | "lesson";
  title: string;
  body: string;
  sourceNodes: number[];
  confidence: number;
}

export interface OrgEventInput {
  id: string | number;
  type: string; // decision.logged | finding.created | finding.resolved | metric.updated | playbook.triggered | playbook.completed | ...
  domain: string;
  title: string;
  summary?: string;
  personId?: number | null;
  personName?: string | null;
  metricRef?: string | null;
  metricValue?: number | null;
  findingId?: number | null;
  findingTitle?: string | null;
  severity?: number | null;
  decisionId?: number | null;
  decisionTitle?: string | null;
  playbookId?: number | null;
  playbookName?: string | null;
  tags?: string[];
  occurredAt: string | Date;
}

// -------------------------------------------------------------------------
// Core graph CRUD
// -------------------------------------------------------------------------

function toEmbeddingStub(label: string, summary: string): string {
  return `${label} — ${summary}`.slice(0, 256);
}

/** Create (or, if an identical entity already exists, refresh) a memory node. */
export async function addNode(
  type: NodeType,
  entityId: string,
  label: string,
  summary: string,
  tags: string[] = [],
): Promise<MemoryNode> {
  const embeddingStub = toEmbeddingStub(label, summary);
  const existing = await db
    .select()
    .from(leadosMemoryNodes)
    .where(and(eq(leadosMemoryNodes.type, type), eq(leadosMemoryNodes.entityId, entityId)))
    .limit(1);

  if (existing[0]) {
    const mergedTags = Array.from(new Set([...existing[0].tags, ...tags]));
    const [updated] = await db
      .update(leadosMemoryNodes)
      .set({ label, summary, embeddingStub, tags: mergedTags, updatedAt: new Date() })
      .where(eq(leadosMemoryNodes.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(leadosMemoryNodes)
    .values({ type, entityId, label, summary, embeddingStub, tags })
    .returning();
  return created;
}

/** Create (or reinforce, if the same relation already connects these two nodes) a memory edge. */
export async function addEdge(
  fromNodeId: number,
  toNodeId: number,
  relation: RelationType,
  weight = 1,
  evidence = "",
): Promise<MemoryEdge> {
  const existing = await db
    .select()
    .from(leadosMemoryEdges)
    .where(
      and(
        eq(leadosMemoryEdges.fromNodeId, fromNodeId),
        eq(leadosMemoryEdges.toNodeId, toNodeId),
        eq(leadosMemoryEdges.relation, relation),
      ),
    )
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(leadosMemoryEdges)
      .set({
        weight: Math.round((existing[0].weight + weight * 0.25) * 100) / 100,
        evidence: evidence || existing[0].evidence,
      })
      .where(eq(leadosMemoryEdges.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(leadosMemoryEdges)
    .values({ fromNodeId, toNodeId, relation, weight, evidence })
    .returning();
  return created;
}

export async function loadGraph(): Promise<GraphSubgraph> {
  const [nodes, edges] = await Promise.all([
    db.select().from(leadosMemoryNodes),
    db.select().from(leadosMemoryEdges),
  ]);
  return { nodes, edges };
}

// -------------------------------------------------------------------------
// Traversal
// -------------------------------------------------------------------------

function buildUndirectedAdjacency(edges: MemoryEdge[], relationFilter?: RelationType[]) {
  const adj = new Map<number, MemoryEdge[]>();
  for (const e of edges) {
    if (relationFilter && relationFilter.length && !relationFilter.includes(e.relation as RelationType)) continue;
    if (!adj.has(e.fromNodeId)) adj.set(e.fromNodeId, []);
    if (!adj.has(e.toNodeId)) adj.set(e.toNodeId, []);
    adj.get(e.fromNodeId)!.push(e);
    adj.get(e.toNodeId)!.push(e);
  }
  return adj;
}

/** BFS traversal of the already-loaded graph from a starting node, up to `depth` hops. */
export function queryGraphSync(
  graph: GraphSubgraph,
  startNodeId: number,
  relationFilter?: RelationType[],
  depth = 2,
): GraphSubgraph {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const adj = buildUndirectedAdjacency(graph.edges, relationFilter);

  const visitedNodes = new Set<number>([startNodeId]);
  const visitedEdges = new Set<number>();
  let frontier = [startNodeId];

  for (let d = 0; d < depth; d++) {
    const next: number[] = [];
    for (const nid of frontier) {
      for (const e of adj.get(nid) ?? []) {
        visitedEdges.add(e.id);
        const other = e.fromNodeId === nid ? e.toNodeId : e.fromNodeId;
        if (!visitedNodes.has(other)) {
          visitedNodes.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }

  return {
    nodes: [...visitedNodes].map((id) => nodeMap.get(id)).filter((n): n is MemoryNode => !!n),
    edges: graph.edges.filter((e) => visitedEdges.has(e.id)),
  };
}

/** Loads the full graph from the DB and returns the BFS subgraph from `startNode`. */
export async function queryGraph(
  startNode: number,
  relationFilter?: RelationType | RelationType[],
  depth = 2,
): Promise<GraphSubgraph> {
  const graph = await loadGraph();
  const filters = relationFilter ? (Array.isArray(relationFilter) ? relationFilter : [relationFilter]) : undefined;
  return queryGraphSync(graph, startNode, filters, depth);
}

/** All nodes connected within 2 hops of the given entity, ranked by combined edge weight. */
export async function findRelatedEntities(entityId: string, type?: NodeType): Promise<RelatedEntity[]> {
  const graph = await loadGraph();
  const start = graph.nodes.find((n) => n.entityId === entityId && (!type || n.type === type));
  if (!start) return [];

  const adj = buildUndirectedAdjacency(graph.edges);
  const scores = new Map<number, RelatedEntity>();
  const visited = new Set<number>([start.id]);
  let frontier: { id: number; hops: number }[] = [{ id: start.id, hops: 0 }];

  for (let hop = 1; hop <= 2; hop++) {
    const next: { id: number; hops: number }[] = [];
    for (const { id } of frontier) {
      for (const e of adj.get(id) ?? []) {
        const otherId = e.fromNodeId === id ? e.toNodeId : e.fromNodeId;
        if (otherId === start.id) continue;
        const otherNode = graph.nodes.find((n) => n.id === otherId);
        if (!otherNode) continue;

        const prior = scores.get(otherId);
        if (prior) {
          prior.combinedWeight = Math.round((prior.combinedWeight + e.weight) * 100) / 100;
          if (!prior.relations.includes(e.relation as RelationType)) prior.relations.push(e.relation as RelationType);
          prior.hops = Math.min(prior.hops, hop);
        } else {
          scores.set(otherId, {
            node: otherNode,
            combinedWeight: e.weight,
            hops: hop,
            relations: [e.relation as RelationType],
          });
        }

        if (!visited.has(otherId)) {
          visited.add(otherId);
          next.push({ id: otherId, hops: hop });
        }
      }
    }
    frontier = next;
  }

  return [...scores.values()].sort((a, b) => b.combinedWeight - a.combinedWeight);
}

// -------------------------------------------------------------------------
// Auto-ingestion
// -------------------------------------------------------------------------

/**
 * When a new organizational event arrives, automatically create/merge the
 * nodes and edges it implies. `existingGraph` is consulted (and mutated in
 * place with any newly created nodes) so repeated calls within one ingest
 * batch don't create duplicate Person/Domain/Metric nodes.
 */
export async function autoIngestEvent(
  event: OrgEventInput,
  existingGraph: GraphSubgraph,
): Promise<{ newNodes: MemoryNode[]; newEdges: MemoryEdge[] }> {
  const newNodes: MemoryNode[] = [];
  const newEdges: MemoryEdge[] = [];

  const findExisting = (type: NodeType, entityId: string) =>
    existingGraph.nodes.find((n) => n.type === type && n.entityId === entityId);

  async function ensureNode(type: NodeType, entityId: string, label: string, summary: string, tags: string[] = []) {
    const existing = findExisting(type, entityId);
    if (existing) return existing;
    const node = await addNode(type, entityId, label, summary, tags);
    newNodes.push(node);
    existingGraph.nodes.push(node);
    return node;
  }

  async function ensureEdge(from: MemoryNode, to: MemoryNode, relation: RelationType, weight: number, evidence: string) {
    const edge = await addEdge(from.id, to.id, relation, weight, evidence);
    if (!newEdges.find((e) => e.id === edge.id)) newEdges.push(edge);
    return edge;
  }

  const domainNode = await ensureNode(
    "domain",
    event.domain,
    event.domain,
    `Organizational domain: ${event.domain}`,
    ["domain", event.domain],
  );
  const personNode = event.personId != null
    ? await ensureNode(
        "person",
        String(event.personId),
        event.personName ?? `Person #${event.personId}`,
        `Org member active in ${event.domain}`,
        ["person", event.domain],
      )
    : null;
  const metricNode = event.metricRef
    ? await ensureNode(
        "metric",
        event.metricRef,
        event.metricRef,
        `Metric tracked in ${event.domain}${event.metricValue != null ? ` — latest value ${event.metricValue}` : ""}`,
        ["metric", event.domain],
      )
    : null;

  switch (event.type) {
    case "decision.logged": {
      const decisionNode = await ensureNode(
        "decision",
        String(event.decisionId ?? event.id),
        event.title,
        event.summary ?? event.title,
        ["decision", event.domain, ...(event.tags ?? [])],
      );
      if (personNode) await ensureEdge(personNode, decisionNode, "created", 1, `${personNode.label} logged decision "${event.title}"`);
      await ensureEdge(decisionNode, domainNode, "informed", 0.6, `Decision affects ${event.domain}`);
      if (metricNode) await ensureEdge(metricNode, decisionNode, "informed", 0.8, `Metric "${metricNode.label}" informed this decision`);
      break;
    }
    case "finding.created": {
      const sev = event.severity ?? 1;
      const findingNode = await ensureNode(
        "finding",
        String(event.findingId ?? event.id),
        event.title,
        event.summary ?? event.title,
        ["finding", event.domain, `sev-${sev}`, ...(event.tags ?? [])],
      );
      if (personNode) await ensureEdge(personNode, findingNode, "created", 1, `${personNode.label} raised finding "${event.title}"`);
      if (metricNode) await ensureEdge(metricNode, findingNode, "caused", Math.min(1, sev / 5), `Metric "${metricNode.label}" triggered this finding`);
      await ensureEdge(
        findingNode,
        domainNode,
        sev >= 4 ? "escalated" : "triggered",
        Math.min(1, sev / 5),
        `Finding impacts ${event.domain}`,
      );
      break;
    }
    case "finding.resolved": {
      const findingNode = await ensureNode(
        "finding",
        String(event.findingId ?? event.id),
        event.title,
        event.summary ?? event.title,
        ["finding", event.domain],
      );
      if (event.decisionId) {
        const decisionNode = await ensureNode(
          "decision",
          String(event.decisionId),
          event.decisionTitle ?? `Decision #${event.decisionId}`,
          "Resolution decision",
          ["decision", event.domain],
        );
        await ensureEdge(decisionNode, findingNode, "resolved", 1, `Decision "${decisionNode.label}" resolved finding "${findingNode.label}"`);
      } else if (personNode) {
        await ensureEdge(personNode, findingNode, "resolved", 1, `${personNode.label} resolved finding "${findingNode.label}"`);
      }
      break;
    }
    case "playbook.triggered": {
      const playbookNode = await ensureNode(
        "playbook",
        String(event.playbookId ?? event.id),
        event.playbookName ?? event.title,
        event.summary ?? event.title,
        ["playbook", event.domain],
      );
      if (event.findingId) {
        const findingNode = await ensureNode(
          "finding",
          String(event.findingId),
          event.findingTitle ?? `Finding #${event.findingId}`,
          "Triggering finding",
          ["finding", event.domain],
        );
        await ensureEdge(findingNode, playbookNode, "triggered", 1, `Finding "${findingNode.label}" triggered playbook "${playbookNode.label}"`);
      }
      if (personNode) await ensureEdge(personNode, playbookNode, "created", 0.6, `${personNode.label} ran playbook "${playbookNode.label}"`);
      break;
    }
    case "playbook.completed": {
      const playbookNode = await ensureNode(
        "playbook",
        String(event.playbookId ?? event.id),
        event.playbookName ?? event.title,
        event.summary ?? event.title,
        ["playbook", event.domain],
      );
      if (event.findingId) {
        const findingNode = await ensureNode(
          "finding",
          String(event.findingId),
          event.findingTitle ?? `Finding #${event.findingId}`,
          "Resolved finding",
          ["finding", event.domain],
        );
        await ensureEdge(playbookNode, findingNode, "resolved", 1, `Playbook "${playbookNode.label}" resolved finding "${findingNode.label}"`);
      }
      break;
    }
    case "metric.updated": {
      const mNode = await ensureNode(
        "metric",
        event.metricRef ?? String(event.id),
        event.title,
        event.summary ?? `Latest value ${event.metricValue ?? ""}`,
        ["metric", event.domain, ...(event.tags ?? [])],
      );
      await ensureEdge(mNode, domainNode, "informed", 0.5, `Metric update for ${event.domain}`);
      if (personNode) await ensureEdge(personNode, mNode, "modified", 0.5, `${personNode.label} updated metric "${mNode.label}"`);
      break;
    }
    default: {
      const evNode = await ensureNode(
        "event",
        String(event.id),
        event.title,
        event.summary ?? event.title,
        ["event", event.domain, ...(event.tags ?? [])],
      );
      await ensureEdge(evNode, domainNode, "informed", 0.4, `Event logged in ${event.domain}`);
      if (personNode) await ensureEdge(personNode, evNode, "created", 0.6, `${personNode.label} logged event "${event.title}"`);
    }
  }

  return { newNodes, newEdges };
}

// -------------------------------------------------------------------------
// Pattern detection
// -------------------------------------------------------------------------

export function detectPatterns(graph: GraphSubgraph): Pattern[] {
  const patterns: Pattern[] = [];
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const labelOf = (id: number) => nodeMap.get(id)?.label ?? `#${id}`;

  const outAdj = new Map<number, MemoryEdge[]>();
  for (const e of graph.edges) {
    if (!outAdj.has(e.fromNodeId)) outAdj.set(e.fromNodeId, []);
    outAdj.get(e.fromNodeId)!.push(e);
  }

  // ---- Cycles: directed loops up to length 4 (e.g. "A caused B caused A") ----
  const seenCycles = new Set<string>();
  function dfsCycle(start: number, current: number, path: number[], edgePath: number[], depth: number) {
    if (depth > 4) return;
    for (const e of outAdj.get(current) ?? []) {
      if (e.toNodeId === start && path.length >= 2) {
        const key = [...path].sort((a, b) => a - b).join(",");
        if (!seenCycles.has(key)) {
          seenCycles.add(key);
          patterns.push({
            id: `cycle-${key}`,
            type: "cycle",
            nodeIds: [...path],
            edgeIds: [...edgePath, e.id],
            nodeLabels: path.map(labelOf),
            severity: path.length <= 2 ? "high" : "medium",
            description: `${path.map(labelOf).join(" → ")} → ${labelOf(start)} forms a closed causal loop.`,
          });
        }
        continue;
      }
      if (path.includes(e.toNodeId)) continue;
      dfsCycle(start, e.toNodeId, [...path, e.toNodeId], [...edgePath, e.id], depth + 1);
    }
  }
  for (const n of graph.nodes) dfsCycle(n.id, n.id, [n.id], [], 0);

  // ---- Chains: simple directed paths of length >= 3 edges, kept maximal ----
  const chainCandidates: Pattern[] = [];
  const seenChains = new Set<string>();
  function dfsChain(path: number[], edgePath: number[]) {
    const current = path[path.length - 1];
    const next = (outAdj.get(current) ?? []).filter((e) => !path.includes(e.toNodeId));
    if (path.length - 1 >= 3) {
      const key = path.join(",");
      if (!seenChains.has(key)) {
        seenChains.add(key);
        chainCandidates.push({
          id: `chain-${key}`,
          type: "chain",
          nodeIds: [...path],
          edgeIds: [...edgePath],
          nodeLabels: path.map(labelOf),
          severity: "medium",
          description: path.map(labelOf).join(" → "),
        });
      }
    }
    if (path.length - 1 >= 6) return; // depth cap to keep this bounded
    for (const e of next) dfsChain([...path, e.toNodeId], [...edgePath, e.id]);
  }
  for (const n of graph.nodes) dfsChain([n.id], []);
  // keep only maximal chains (drop any chain that's a strict prefix of a longer one found)
  const maximalChains = chainCandidates
    .filter(
      (p) =>
        !chainCandidates.some(
          (q) => q !== p && q.nodeIds.length > p.nodeIds.length && q.nodeIds.slice(0, p.nodeIds.length).join(",") === p.nodeIds.join(","),
        ),
    )
    .sort((a, b) => b.nodeIds.length - a.nodeIds.length)
    .slice(0, 10);
  patterns.push(...maximalChains);

  // ---- Clusters: undirected cliques of size >= 4 ----
  const undirAdj = new Map<number, Set<number>>();
  for (const e of graph.edges) {
    if (!undirAdj.has(e.fromNodeId)) undirAdj.set(e.fromNodeId, new Set());
    if (!undirAdj.has(e.toNodeId)) undirAdj.set(e.toNodeId, new Set());
    undirAdj.get(e.fromNodeId)!.add(e.toNodeId);
    undirAdj.get(e.toNodeId)!.add(e.fromNodeId);
  }
  const seenClusters = new Set<string>();
  const nodeIdsList = graph.nodes.map((n) => n.id);
  for (const a of nodeIdsList) {
    const neighborsA = [...(undirAdj.get(a) ?? [])].filter((x) => x > a);
    for (const b of neighborsA) {
      const commonAB = neighborsA.filter((x) => x !== b && undirAdj.get(b)?.has(x));
      for (let k = 0; k < commonAB.length; k++) {
        for (let l = k + 1; l < commonAB.length; l++) {
          const c = commonAB[k];
          const d = commonAB[l];
          if (undirAdj.get(c)?.has(d)) {
            const clique = [a, b, c, d].sort((x, y) => x - y);
            const key = clique.join(",");
            if (!seenClusters.has(key)) {
              seenClusters.add(key);
              patterns.push({
                id: `cluster-${key}`,
                type: "cluster",
                nodeIds: clique,
                edgeIds: graph.edges.filter((e) => clique.includes(e.fromNodeId) && clique.includes(e.toNodeId)).map((e) => e.id),
                nodeLabels: clique.map(labelOf),
                severity: "low",
                description: `${clique.map(labelOf).join(", ")} are all mutually connected.`,
              });
            }
          }
        }
      }
    }
  }

  // ---- Isolated critical nodes: high-stakes but barely connected ----
  const degree = new Map<number, number>();
  for (const e of graph.edges) {
    degree.set(e.fromNodeId, (degree.get(e.fromNodeId) ?? 0) + 1);
    degree.set(e.toNodeId, (degree.get(e.toNodeId) ?? 0) + 1);
  }
  for (const n of graph.nodes) {
    const isCriticalTag = n.tags.includes("sev-5") || n.tags.includes("sev-4") || n.tags.includes("critical");
    const deg = degree.get(n.id) ?? 0;
    // Every ingested finding automatically picks up at least a "created by"
    // edge and a "domain" edge (degree 2). Anything still at or below that
    // baseline — i.e. no decision, playbook, or resolution ever attached —
    // counts as critical-but-isolated: high stakes, no follow-through.
    if (isCriticalTag && deg <= 2) {
      patterns.push({
        id: `isolated-${n.id}`,
        type: "isolated_critical",
        nodeIds: [n.id],
        edgeIds: [],
        nodeLabels: [n.label],
        severity: "high",
        description: `"${n.label}" is high-severity but has only ${deg} connection(s) in the knowledge graph.`,
      });
    }
  }

  return patterns;
}

// -------------------------------------------------------------------------
// Insight generation
// -------------------------------------------------------------------------

export function generateInsight(pattern: Pattern): Insight {
  switch (pattern.type) {
    case "cycle": {
      const chain = pattern.nodeLabels.join(" → ");
      return {
        type: "pattern",
        title: `Recurring loop detected: ${pattern.nodeLabels[0]}${pattern.nodeLabels[1] ? ` ↔ ${pattern.nodeLabels[1]}` : ""}`,
        body: `The graph shows a closed causal loop: ${chain} → ${pattern.nodeLabels[0]}. This usually means the organization is treating a symptom rather than the root cause — the same issue keeps re-triggering itself through these ${pattern.nodeIds.length} connected item(s). Consider a structural fix instead of another point decision.`,
        sourceNodes: pattern.nodeIds,
        confidence: Math.min(0.95, 0.6 + pattern.nodeIds.length * 0.05),
      };
    }
    case "chain": {
      return {
        type: "pattern",
        title: `Causal chain: ${pattern.nodeLabels[0]} eventually led to ${pattern.nodeLabels[pattern.nodeLabels.length - 1]}`,
        body: `Tracing the knowledge graph surfaces a ${pattern.nodeIds.length - 1}-step chain: ${pattern.nodeLabels.join(" → ")}. This documents "why did we do X" — worth citing the next time this decision is questioned, and a strong candidate for turning into a playbook since the same sequence is likely to recur.`,
        sourceNodes: pattern.nodeIds,
        confidence: Math.min(0.9, 0.55 + (pattern.nodeIds.length - 3) * 0.05),
      };
    }
    case "cluster": {
      return {
        type: "pattern",
        title: `Tightly coupled cluster around ${pattern.nodeLabels.slice(0, 2).join(" & ")}`,
        body: `${pattern.nodeIds.length} entities (${pattern.nodeLabels.join(", ")}) are all mutually connected in the graph. These items move together — a change to any one of them is likely to ripple through the rest. Treat them as a single unit when planning or assessing risk.`,
        sourceNodes: pattern.nodeIds,
        confidence: 0.5,
      };
    }
    case "isolated_critical":
    default: {
      return {
        type: "anomaly",
        title: `Critical item with no follow-through: ${pattern.nodeLabels[0]}`,
        body: `"${pattern.nodeLabels[0]}" is flagged high-severity but has almost no connections in the knowledge graph — no owning decision, no resolution path on record. High-impact items that stay isolated tend to get forgotten. Recommend explicitly assigning an owner or matching it to a playbook.`,
        sourceNodes: pattern.nodeIds,
        confidence: 0.65,
      };
    }
  }
}
