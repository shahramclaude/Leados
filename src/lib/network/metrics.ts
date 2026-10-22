// LEADOS Part 31 — Ecosystem Intelligence metric library.
//
// All functions here are pure (no I/O) so they can be unit-tested against known
// fixtures (Phase 4 gate: "centrality on known graphs, HHI hand-checks, bus-factor
// brute-force comparison"). Every formula is documented inline per the standing order.
//
// HONESTY NOTE: centrality measures *structural position in the dependency graph*
// (how many critical paths run through a node), not a person's worth, competence,
// or authority over people. Callers must not present these numbers as performance
// or leadership scores. See privacy.ts for the access guardrails that keep
// per-person centrality from being read outside permitted scopes.

import type {
  BlastRadiusNode,
  BlastRadiusResult,
  BusFactorResult,
  CentralityResult,
  ChokePointResult,
  EcosystemGraph,
  EdgeType,
  GraphEdge,
  HhiResult,
  ShareInput,
  SkillCoverageInput,
} from "./types";
import { DEPENDENCY_EDGE_TYPES } from "./types";

// ---------------------------------------------------------------------------
// Adjacency helpers
// ---------------------------------------------------------------------------

interface Adjacency {
  nodeIds: string[];
  /** Undirected neighbor list, used for degree/betweenness/eigenvector. */
  undirected: Map<string, string[]>;
  /** Directed out-edges, used for dependency-path analysis. */
  outEdges: Map<string, GraphEdge[]>;
  inEdges: Map<string, GraphEdge[]>;
}

function buildAdjacency(graph: EcosystemGraph, edgeFilter?: (e: GraphEdge) => boolean): Adjacency {
  const nodeIds = graph.nodes.map((n) => n.id);
  const undirected = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  const outEdges = new Map<string, GraphEdge[]>(nodeIds.map((id) => [id, []]));
  const inEdges = new Map<string, GraphEdge[]>(nodeIds.map((id) => [id, []]));

  for (const edge of graph.edges) {
    if (edgeFilter && !edgeFilter(edge)) continue;
    if (!undirected.has(edge.source) || !undirected.has(edge.target)) continue;
    undirected.get(edge.source)!.push(edge.target);
    undirected.get(edge.target)!.push(edge.source);
    outEdges.get(edge.source)!.push(edge);
    inEdges.get(edge.target)!.push(edge);
  }

  return { nodeIds, undirected, outEdges, inEdges };
}

// ---------------------------------------------------------------------------
// Degree centrality
// ---------------------------------------------------------------------------

export function degreeCentrality(graph: EcosystemGraph): Map<string, number> {
  const adj = buildAdjacency(graph);
  const result = new Map<string, number>();
  for (const id of adj.nodeIds) {
    result.set(id, adj.undirected.get(id)!.length);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Betweenness centrality — Brandes' algorithm, O(VE) unweighted.
// Measures how often a node sits on the shortest path between two other nodes,
// i.e. how central it is to the flow of dependency/communication across the
// ecosystem. High betweenness + low substitutability = critical-path risk.
// ---------------------------------------------------------------------------

export function betweennessCentrality(graph: EcosystemGraph): Map<string, number> {
  const adj = buildAdjacency(graph);
  const betweenness = new Map<string, number>(adj.nodeIds.map((id) => [id, 0]));

  for (const s of adj.nodeIds) {
    const stack: string[] = [];
    const predecessors = new Map<string, string[]>(adj.nodeIds.map((id) => [id, []]));
    const sigma = new Map<string, number>(adj.nodeIds.map((id) => [id, 0]));
    const dist = new Map<string, number>(adj.nodeIds.map((id) => [id, -1]));
    sigma.set(s, 1);
    dist.set(s, 0);

    const queue: string[] = [s];
    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);
      for (const w of adj.undirected.get(v) ?? []) {
        if (dist.get(w) === -1) {
          dist.set(w, dist.get(v)! + 1);
          queue.push(w);
        }
        if (dist.get(w) === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          predecessors.get(w)!.push(v);
        }
      }
    }

    const delta = new Map<string, number>(adj.nodeIds.map((id) => [id, 0]));
    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of predecessors.get(w)!) {
        const ratio = (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!);
        delta.set(v, delta.get(v)! + ratio);
      }
      if (w !== s) {
        betweenness.set(w, betweenness.get(w)! + delta.get(w)!);
      }
    }
  }

  // Undirected graphs: each shortest path counted twice (once from each endpoint).
  for (const id of adj.nodeIds) {
    betweenness.set(id, betweenness.get(id)! / 2);
  }

  return betweenness;
}

// ---------------------------------------------------------------------------
// Eigenvector centrality — power iteration.
// A node scores high if it is connected to other high-scoring nodes — useful for
// spotting "hub of hubs" dependency concentration, not raw popularity.
// ---------------------------------------------------------------------------

export function eigenvectorCentrality(
  graph: EcosystemGraph,
  options: { iterations?: number; tolerance?: number } = {},
): Map<string, number> {
  const { iterations = 200, tolerance = 1e-10 } = options;
  const adj = buildAdjacency(graph);
  const n = adj.nodeIds.length;
  if (n === 0) return new Map();

  let x = new Map<string, number>(adj.nodeIds.map((id) => [id, 1 / Math.sqrt(n)]));

  for (let iter = 0; iter < iterations; iter++) {
    const next = new Map<string, number>(adj.nodeIds.map((id) => [id, 0]));
    for (const id of adj.nodeIds) {
      // Iterate on (A + I) rather than A: this leaves the dominant
      // eigenvector unchanged (eigenvalues merely shift by +1) but breaks the
      // period-2 oscillation power iteration otherwise hits on bipartite
      // graphs (e.g. a plain star/hub-and-spoke dependency shape), where A's
      // top two eigenvalues are +lambda and -lambda.
      let sum = x.get(id) ?? 0;
      for (const neighbor of adj.undirected.get(id)!) {
        sum += x.get(neighbor) ?? 0;
      }
      next.set(id, sum);
    }
    const norm = Math.sqrt([...next.values()].reduce((acc, v) => acc + v * v, 0));
    if (norm === 0) {
      // Disconnected / isolated graph: fall back to uniform distribution.
      return new Map(adj.nodeIds.map((id) => [id, 1 / n]));
    }
    let maxDelta = 0;
    for (const id of adj.nodeIds) {
      const normalized = next.get(id)! / norm;
      maxDelta = Math.max(maxDelta, Math.abs(normalized - (x.get(id) ?? 0)));
      next.set(id, normalized);
    }
    x = next;
    if (maxDelta < tolerance) break;
  }

  return x;
}

export function computeCentrality(graph: EcosystemGraph): CentralityResult[] {
  const degree = degreeCentrality(graph);
  const betweenness = betweennessCentrality(graph);
  const eigenvector = eigenvectorCentrality(graph);
  const adj = buildAdjacency(graph);

  return graph.nodes.map((node) => ({
    nodeId: node.id,
    degree: degree.get(node.id) ?? 0,
    inDegree: adj.inEdges.get(node.id)?.length ?? 0,
    outDegree: adj.outEdges.get(node.id)?.length ?? 0,
    betweenness: round(betweenness.get(node.id) ?? 0),
    eigenvector: round(eigenvector.get(node.id) ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// HHI concentration risk — Herfindahl-Hirschman Index.
// HHI = Σ s_i², where s_i is entity i's share of the total (0..1).
// Range: 1/n (perfectly spread across n entities) .. 1 (single entity = 100%).
// Bands (adapted from US antitrust practice, used here as an internal risk signal,
// not a legal determination): <0.15 low, 0.15–0.25 moderate, >0.25 high.
// ---------------------------------------------------------------------------

export function herfindahlHirschmanIndex(inputs: ShareInput[]): HhiResult {
  const total = inputs.reduce((acc, i) => acc + Math.max(0, i.amount), 0);
  if (total <= 0 || inputs.length === 0) {
    return { hhi: 0, topShare: 0, shares: [], band: "low" };
  }

  const shares = inputs
    .map((i) => ({ key: i.key, share: Math.max(0, i.amount) / total }))
    .sort((a, b) => b.share - a.share);

  const hhi = shares.reduce((acc, s) => acc + s.share * s.share, 0);
  const topShare = shares[0]?.share ?? 0;
  const band: HhiResult["band"] = hhi > 0.25 ? "high" : hhi > 0.15 ? "moderate" : "low";

  return { hhi: round(hhi), topShare: round(topShare), shares, band };
}

// ---------------------------------------------------------------------------
// Bus factor — minimum number of people whose simultaneous departure would drop
// a capability's available capacity below the required threshold.
//
// Model: additive capacity (each person contributes independent capacity to a
// capability). Because the model is additive, greedy removal of the
// highest-capacity people first is provably optimal (no reordering can reduce
// the cumulative sum faster) — verified against brute-force enumeration in
// metrics.test.ts for small fixtures.
// ---------------------------------------------------------------------------

export function busFactor(
  capability: string,
  coverage: SkillCoverageInput[],
  requiredCapacity: number,
): BusFactorResult {
  const totalCapacity = coverage.reduce((acc, c) => acc + c.capacity, 0);
  const sorted = [...coverage].sort((a, b) => b.capacity - a.capacity);

  let remaining = totalCapacity;
  const critical: string[] = [];
  for (const person of sorted) {
    if (remaining >= requiredCapacity) {
      // Already have enough even without removing anyone else — stop counting
      // once the threshold would be breached by removing one more person.
    }
    remaining -= person.capacity;
    critical.push(person.personId);
    if (remaining < requiredCapacity) {
      break;
    }
  }

  return {
    capability,
    busFactor: critical.length,
    totalCapacity: round(totalCapacity),
    requiredCapacity,
    criticalPeople: critical,
  };
}

/** Brute-force reference implementation used only in tests to verify the greedy result. */
export function busFactorBruteForce(
  coverage: SkillCoverageInput[],
  requiredCapacity: number,
): number {
  const n = coverage.length;
  const total = coverage.reduce((acc, c) => acc + c.capacity, 0);
  if (total < requiredCapacity) return 0;

  for (let k = 1; k <= n; k++) {
    // Does there exist a subset of size k whose removal drops capacity below threshold?
    // Equivalent: does the *minimum* possible remaining capacity after removing any
    // k people fall below threshold? Minimum remaining = total - (sum of k largest).
    const sorted = [...coverage].sort((a, b) => b.capacity - a.capacity);
    const removedSum = sorted.slice(0, k).reduce((acc, c) => acc + c.capacity, 0);
    if (total - removedSum < requiredCapacity) {
      return k;
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Choke-point detection — min-cut between a source and sink over dependency
// edges, using Edmonds-Karp (BFS augmenting paths). Capacity per edge =
// strength * (1 - substitutability + 0.01), so material + hard-to-substitute
// dependencies are "harder to cut" (larger capacity), making the min-cut
// surface the truly scarce paths rather than every edge equally.
// ---------------------------------------------------------------------------

export function findChokePoints(
  graph: EcosystemGraph,
  source: string,
  sink: string,
  edgeTypes: ReadonlySet<EdgeType> = DEPENDENCY_EDGE_TYPES,
): ChokePointResult {
  const edges = graph.edges.filter((e) => edgeTypes.has(e.edgeType));
  const capacity = new Map<string, number>(); // key: `${from}->${to}` directed residual
  const edgeByKey = new Map<string, GraphEdge>();
  const nodes = new Set<string>(graph.nodes.map((n) => n.id));

  for (const e of edges) {
    if (!nodes.has(e.source) || !nodes.has(e.target)) continue;
    const cap = e.strength * (1 - e.substitutability) + 0.01;
    const key = `${e.source}->${e.target}`;
    capacity.set(key, (capacity.get(key) ?? 0) + cap);
    if (!capacity.has(`${e.target}->${e.source}`)) {
      capacity.set(`${e.target}->${e.source}`, 0);
    }
    edgeByKey.set(key, e);
  }

  const neighborsOf = (id: string): string[] => {
    const result = new Set<string>();
    for (const key of capacity.keys()) {
      const [from, to] = key.split("->");
      if (from === id) result.add(to);
    }
    return [...result];
  };

  let maxFlow = 0;
  for (;;) {
    // BFS for an augmenting path with positive residual capacity.
    const parent = new Map<string, string>();
    const visited = new Set<string>([source]);
    const queue = [source];
    while (queue.length > 0) {
      const u = queue.shift()!;
      for (const v of neighborsOf(u)) {
        const residual = capacity.get(`${u}->${v}`) ?? 0;
        if (residual > 1e-9 && !visited.has(v)) {
          visited.add(v);
          parent.set(v, u);
          queue.push(v);
        }
      }
    }
    if (!visited.has(sink)) {
      // No augmenting path: visited set = source side of min cut.
      const cutEdgeIds: string[] = [];
      let cutValue = 0;
      for (const e of edges) {
        if (visited.has(e.source) && !visited.has(e.target)) {
          cutEdgeIds.push(e.id);
          cutValue += e.strength * (1 - e.substitutability) + 0.01;
        }
      }
      return { source, sink, minCutValue: round(maxFlow), cutEdgeIds };
    }

    // Find bottleneck along the path.
    let bottleneck = Infinity;
    let v = sink;
    while (v !== source) {
      const u = parent.get(v)!;
      bottleneck = Math.min(bottleneck, capacity.get(`${u}->${v}`) ?? 0);
      v = u;
    }
    v = sink;
    while (v !== source) {
      const u = parent.get(v)!;
      capacity.set(`${u}->${v}`, (capacity.get(`${u}->${v}`) ?? 0) - bottleneck);
      capacity.set(`${v}->${u}`, (capacity.get(`${v}->${u}`) ?? 0) + bottleneck);
      v = u;
    }
    maxFlow += bottleneck;
  }
}

// ---------------------------------------------------------------------------
// Blast radius — scenario shock: "lose this partner/key person".
// BFS outward over dependency edges pointing *into* the removed node (i.e. who
// depends on it), with recovery estimate per hop:
//   recoveryDays(hop) = BASE_DAYS * (1 - substitutability) / hop_decay
// decayed geometrically with hop distance (indirect exposure recovers faster
// because intermediate nodes absorb/buffer the shock).
// ---------------------------------------------------------------------------

const BASE_RECOVERY_DAYS = 14;
const HOP_DECAY = 1.6;

export function computeBlastRadius(
  graph: EcosystemGraph,
  removedNodeId: string,
): BlastRadiusResult {
  const adj = buildAdjacency(graph, (e) => DEPENDENCY_EDGE_TYPES.has(e.edgeType));
  // Dependents of `removedNodeId` are nodes with an edge *pointing to* it
  // (source depends_on/reports_to/supplies -> target), so we walk in-edges.
  const dependentsOf = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) {
    if (!DEPENDENCY_EDGE_TYPES.has(e.edgeType)) continue;
    if (!dependentsOf.has(e.target)) dependentsOf.set(e.target, []);
    dependentsOf.get(e.target)!.push(e);
  }

  const visited = new Map<string, { hops: number; substitutability: number }>();
  const queue: { id: string; hops: number }[] = [{ id: removedNodeId, hops: 0 }];
  visited.set(removedNodeId, { hops: 0, substitutability: 0 });

  while (queue.length > 0) {
    const { id, hops } = queue.shift()!;
    const incoming = dependentsOf.get(id) ?? [];
    for (const edge of incoming) {
      if (visited.has(edge.source)) continue;
      visited.set(edge.source, { hops: hops + 1, substitutability: edge.substitutability });
      queue.push({ id: edge.source, hops: hops + 1 });
    }
  }
  visited.delete(removedNodeId);

  const affected: BlastRadiusNode[] = [...visited.entries()].map(([nodeId, v]) => {
    const decay = Math.pow(HOP_DECAY, v.hops - 1);
    const days = (BASE_RECOVERY_DAYS * (1 - v.substitutability)) / decay;
    return {
      nodeId,
      hops: v.hops,
      estimatedRecoveryDays: round(Math.max(0.5, days)),
    };
  });

  affected.sort((a, b) => a.hops - b.hops || b.estimatedRecoveryDays - a.estimatedRecoveryDays);

  return {
    removedNodeId,
    affected,
    maxRecoveryDays: round(affected.reduce((acc, a) => Math.max(acc, a.estimatedRecoveryDays), 0)),
    totalAffectedNodes: affected.length,
  };
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
