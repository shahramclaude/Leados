// Org Network Analysis — models the organisation as a live, weighted graph
// built from explicit `relationships` edges plus *implicit* edges derived
// from event co-occurrence (people who show up in the same
// `meeting.attended` event are linked). Implements PageRank (influence),
// Brandes' betweenness centrality (information brokers), Bron–Kerbosch
// maximal cliques (tightly-knit groups) and isolation-risk detection — all
// from scratch, no graph library dependency.
//
// COST NOTE: betweennessCentrality is O(V*E log V)-ish (per-source
// Dijkstra-style relaxation) and findCliques (Bron–Kerbosch) is worst-case
// exponential. Both are fine for the handful-of-seconds "full report" path
// (src/lib/peopleIntelligence.ts calls analyzeOrgNetwork once per request)
// but are deliberately NOT used by orgODE.ts's fastOrgDynamics, which has a
// hard <500ms budget — see the Big-O note in orgODE.ts.

import type { PersonEvent } from "./flightRisk";
import type { PersonId, PersonRecord, RelationshipRecord } from "./talentEngine";

export interface WeightedEdge {
  a: PersonId;
  b: PersonId;
  weight: number; // 0..1+ combined strength
  types: string[];
}

export interface OrgNetworkReport {
  influencers: { id: PersonId; name: string; role: string; score: number }[];
  brokers: { id: PersonId; name: string; role: string; score: number }[];
  cliques: { members: { id: PersonId; name: string }[]; cohesion: number }[];
  isolated: { id: PersonId; name: string; role: string; connections: number }[];
  healthScore: number;
  nodeCount: number;
  edgeCount: number;
}

export interface NetworkGraph {
  nodes: PersonId[];
  edges: WeightedEdge[];
}

/** Build the weighted undirected adjacency from explicit relationships + meeting co-occurrence. */
export function buildNetworkGraph(
  people: { id: PersonId }[],
  relationships: RelationshipRecord[],
  events: PersonEvent[]
): NetworkGraph {
  const nodes = people.map((p) => p.id);
  const nodeSet = new Set(nodes);
  const edgeMap = new Map<string, WeightedEdge>();

  function addEdge(a: PersonId, b: PersonId, weight: number, type: string) {
    if (a === b || !nodeSet.has(a) || !nodeSet.has(b)) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    const existing = edgeMap.get(key);
    if (existing) {
      existing.weight = Math.min(1.5, existing.weight + weight);
      if (!existing.types.includes(type)) existing.types.push(type);
    } else {
      edgeMap.set(key, { a: Math.min(a, b), b: Math.max(a, b), weight, types: [type] });
    }
  }

  relationships.forEach((r) => addEdge(r.fromId, r.toId, r.strength, r.type));

  // Derive co-occurrence edges from meeting events: data.attendees: number[]
  const meetings = events.filter((e) => e.type === "meeting.attended");
  meetings.forEach((m) => {
    const attendees = Array.isArray(m.data.attendees) ? (m.data.attendees as number[]) : [];
    for (let i = 0; i < attendees.length; i++) {
      for (let j = i + 1; j < attendees.length; j++) {
        addEdge(attendees[i], attendees[j], 0.08, "co-occurrence");
      }
    }
  });

  return { nodes, edges: Array.from(edgeMap.values()) };
}

function toAdjacency(graph: NetworkGraph): Map<PersonId, { to: PersonId; weight: number }[]> {
  const adj = new Map<PersonId, { to: PersonId; weight: number }[]>();
  graph.nodes.forEach((n) => adj.set(n, []));
  graph.edges.forEach((e) => {
    adj.get(e.a)?.push({ to: e.b, weight: e.weight });
    adj.get(e.b)?.push({ to: e.a, weight: e.weight });
  });
  return adj;
}

/** PageRank over the (symmetrised) weighted graph — proxy for organisational influence. */
export function pageRank(graph: NetworkGraph, damping = 0.85, iterations = 60): Record<PersonId, number> {
  const n = graph.nodes.length;
  if (!n) return {};
  const adj = toAdjacency(graph);
  const outWeight = new Map<PersonId, number>();
  adj.forEach((edges, id) => outWeight.set(id, edges.reduce((s, e) => s + e.weight, 0)));

  let ranks: Record<PersonId, number> = {};
  graph.nodes.forEach((id) => (ranks[id] = 1 / n));

  for (let iter = 0; iter < iterations; iter++) {
    const next: Record<PersonId, number> = {};
    graph.nodes.forEach((id) => (next[id] = (1 - damping) / n));

    graph.nodes.forEach((id) => {
      const edges = adj.get(id) ?? [];
      const total = outWeight.get(id) ?? 0;
      if (!total) {
        // dangling node: distribute evenly
        graph.nodes.forEach((other) => {
          next[other] += (damping * ranks[id]) / n;
        });
        return;
      }
      edges.forEach((e) => {
        next[e.to] += damping * ranks[id] * (e.weight / total);
      });
    });

    ranks = next;
  }

  return ranks;
}

/** Brandes' algorithm for weighted-shortest-path betweenness centrality (information brokers). */
export function betweennessCentrality(graph: NetworkGraph): Record<PersonId, number> {
  const centrality: Record<PersonId, number> = {};
  graph.nodes.forEach((n) => (centrality[n] = 0));
  const adj = toAdjacency(graph);

  for (const s of graph.nodes) {
    const stack: PersonId[] = [];
    const predecessors = new Map<PersonId, PersonId[]>();
    const sigma = new Map<PersonId, number>();
    const dist = new Map<PersonId, number>();
    graph.nodes.forEach((n) => {
      predecessors.set(n, []);
      sigma.set(n, 0);
      dist.set(n, Infinity);
    });
    sigma.set(s, 1);
    dist.set(s, 0);

    // Dijkstra-ish BFS using inverse weight as distance (stronger ties = shorter hops)
    const visited = new Set<PersonId>();
    const queue: PersonId[] = [s];

    while (queue.length) {
      queue.sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity));
      const v = queue.shift()!;
      if (visited.has(v)) continue;
      visited.add(v);
      stack.push(v);

      for (const { to: w, weight } of adj.get(v) ?? []) {
        const edgeDist = 1 / Math.max(0.05, weight);
        const newDist = (dist.get(v) ?? Infinity) + edgeDist;
        if (newDist < (dist.get(w) ?? Infinity)) {
          dist.set(w, newDist);
          sigma.set(w, sigma.get(v) ?? 0);
          predecessors.set(w, [v]);
          queue.push(w);
        } else if (newDist === dist.get(w)) {
          sigma.set(w, (sigma.get(w) ?? 0) + (sigma.get(v) ?? 0));
          predecessors.get(w)!.push(v);
        }
      }
    }

    const delta = new Map<PersonId, number>();
    graph.nodes.forEach((n) => delta.set(n, 0));

    while (stack.length) {
      const w = stack.pop()!;
      for (const v of predecessors.get(w) ?? []) {
        const share = ((sigma.get(v) ?? 0) / (sigma.get(w) || 1)) * (1 + (delta.get(w) ?? 0));
        delta.set(v, (delta.get(v) ?? 0) + share);
      }
      if (w !== s) {
        centrality[w] += delta.get(w) ?? 0;
      }
    }
  }

  // Normalise by the number of node pairs (undirected => divide by 2)
  const n = graph.nodes.length;
  const norm = n > 2 ? (n - 1) * (n - 2) : 1;
  graph.nodes.forEach((n2) => (centrality[n2] = centrality[n2] / 2 / norm));

  return centrality;
}

/** Bron–Kerbosch without pivoting — maximal cliques of size >= 3. Fine for org-sized graphs. */
export function findCliques(graph: NetworkGraph): PersonId[][] {
  const adj = new Map<PersonId, Set<PersonId>>();
  graph.nodes.forEach((n) => adj.set(n, new Set()));
  graph.edges.forEach((e) => {
    if (e.weight < 0.2) return; // only count meaningfully-strong ties as clique edges
    adj.get(e.a)?.add(e.b);
    adj.get(e.b)?.add(e.a);
  });

  const cliques: PersonId[][] = [];

  function bronKerbosch(r: Set<PersonId>, p: Set<PersonId>, x: Set<PersonId>) {
    if (p.size === 0 && x.size === 0) {
      if (r.size >= 3) cliques.push(Array.from(r));
      return;
    }
    for (const v of Array.from(p)) {
      const neighbours = adj.get(v) ?? new Set();
      bronKerbosch(
        new Set([...r, v]),
        new Set(Array.from(p).filter((n) => neighbours.has(n))),
        new Set(Array.from(x).filter((n) => neighbours.has(n)))
      );
      p.delete(v);
      x.add(v);
    }
  }

  bronKerbosch(new Set(), new Set(graph.nodes), new Set());

  // De-dupe / keep only maximal sets, sort largest first
  const unique = cliques
    .sort((a, b) => b.length - a.length)
    .filter((c, i, arr) => !arr.slice(0, i).some((other) => c.every((m) => other.includes(m))));

  return unique;
}

export function isolationRisk(graph: NetworkGraph): { id: PersonId; connections: number }[] {
  const degree = new Map<PersonId, number>();
  graph.nodes.forEach((n) => degree.set(n, 0));
  graph.edges.forEach((e) => {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  });
  return graph.nodes
    .map((id) => ({ id, connections: degree.get(id) ?? 0 }))
    .filter((d) => d.connections < 2);
}

export function analyzeOrgNetwork(
  people: PersonRecord[],
  relationships: RelationshipRecord[],
  events: PersonEvent[]
): OrgNetworkReport {
  const active = people.filter((p) => !p.archived);
  const graph = buildNetworkGraph(active, relationships, events);
  const byId = new Map(active.map((p) => [p.id, p]));

  const ranks = pageRank(graph);
  const betweenness = betweennessCentrality(graph);
  const cliques = findCliques(graph);
  const isolated = isolationRisk(graph);

  const influencers = Object.entries(ranks)
    .map(([id, score]) => ({ id: Number(id), score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((r) => ({ id: r.id, name: byId.get(r.id)?.name ?? `#${r.id}`, role: byId.get(r.id)?.role ?? "", score: Math.round(r.score * 1000) / 1000 }));

  const brokers = Object.entries(betweenness)
    .map(([id, score]) => ({ id: Number(id), score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((r) => ({ id: r.id, name: byId.get(r.id)?.name ?? `#${r.id}`, role: byId.get(r.id)?.role ?? "", score: Math.round(r.score * 1000) / 1000 }));

  const cliqueReport = cliques.slice(0, 10).map((members) => ({
    members: members.map((id) => ({ id, name: byId.get(id)?.name ?? `#${id}` })),
    cohesion: Math.round((members.length / Math.max(1, active.length)) * 1000) / 1000,
  }));

  const isolatedReport = isolated.map((i) => ({
    id: i.id,
    name: byId.get(i.id)?.name ?? `#${i.id}`,
    role: byId.get(i.id)?.role ?? "",
    connections: i.connections,
  }));

  const n = active.length || 1;
  const isolationPenalty = (isolatedReport.length / n) * 40;
  const density = graph.edges.length / Math.max(1, (n * (n - 1)) / 2);
  const densityScore = Math.min(1, density * 4) * 30;
  const cliqueBonus = Math.min(1, cliqueReport.length / Math.max(1, Math.ceil(n / 6))) * 30;
  const healthScore = Math.round(Math.max(0, Math.min(100, 70 - isolationPenalty + densityScore * 0 + cliqueBonus * 0 + densityScore)));

  return {
    influencers,
    brokers,
    cliques: cliqueReport,
    isolated: isolatedReport,
    healthScore,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
  };
}
