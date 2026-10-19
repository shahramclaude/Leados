import type { PersonState } from './types';

export interface NetworkNode {
  id: string;
  name: string;
  title: string;
  centrality: number; // 0-1, normalized PageRank
  cluster: string;
}

export interface NetworkEdge {
  from: string;
  to: string;
  type: 'reports_to' | 'collaboration';
  strength: number;
}

export interface NetworkCluster {
  id: string;
  memberIds: string[];
  label: string;
  cohesionScore: number;
}

export interface OrgNetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  pageRankScores: Record<string, number>;
  maxPageRank: number;
  clusters: NetworkCluster[];
  isolatedNodes: string[];
  bridges: string[];
  knowledgeSiloIndex: number;
  neighborClusters: Record<string, Set<string>>;
  clusterOf: Record<string, string>;
}

/**
 * Simplified PageRank — Page, Brin, Motwani & Winograd (1998).
 * DESIGN PARAMETER: damping factor d = 0.85 (standard), 10 iterations
 * (sufficient for convergence on graphs of this size; not re-normalized
 * to sum to 1, matching the raw iterative formula below).
 *   PR(n) = (1 - d) + d * Σ_{m→n} PR(m) / outDegree(m)
 */
function pageRank(nodeIds: string[], directedEdges: { from: string; to: string }[], d = 0.85, iterations = 10) {
  const outDegree: Record<string, number> = {};
  nodeIds.forEach((id) => (outDegree[id] = 0));
  directedEdges.forEach((e) => (outDegree[e.from] = (outDegree[e.from] || 0) + 1));

  const incoming: Record<string, string[]> = {};
  nodeIds.forEach((id) => (incoming[id] = []));
  directedEdges.forEach((e) => incoming[e.to]?.push(e.from));

  let pr: Record<string, number> = {};
  nodeIds.forEach((id) => (pr[id] = 1 / Math.max(1, nodeIds.length)));

  for (let iter = 0; iter < iterations; iter++) {
    const next: Record<string, number> = {};
    nodeIds.forEach((id) => {
      let sum = 0;
      for (const m of incoming[id]) {
        sum += pr[m] / (outDegree[m] || 1);
      }
      next[id] = 1 - d + d * sum;
    });
    pr = next;
  }
  return pr;
}

class UnionFind {
  parent = new Map<string, string>();
  init(id: string) {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }
  find(id: string): string {
    this.init(id);
    let root = id;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = id;
    while (this.parent.get(cur) !== cur) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** Articulation points (cut vertices) via Tarjan's DFS low-link algorithm. */
function findArticulationPoints(nodeIds: string[], undirectedEdges: { a: string; b: string }[]): string[] {
  const adj = new Map<string, string[]>();
  nodeIds.forEach((id) => adj.set(id, []));
  undirectedEdges.forEach((e) => {
    adj.get(e.a)?.push(e.b);
    adj.get(e.b)?.push(e.a);
  });

  const visited = new Set<string>();
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const articulation = new Set<string>();
  let timer = 0;

  function dfs(u: string) {
    visited.add(u);
    disc.set(u, timer);
    low.set(u, timer);
    timer++;
    let children = 0;
    for (const v of adj.get(u) || []) {
      if (!visited.has(v)) {
        children++;
        parent.set(v, u);
        dfs(v);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
        if (parent.get(u) !== null && low.get(v)! >= disc.get(u)!) {
          articulation.add(u);
        }
        if (parent.get(u) === undefined && children > 1) {
          articulation.add(u);
        }
      } else if (v !== parent.get(u)) {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!));
      }
    }
  }

  for (const id of nodeIds) {
    if (!visited.has(id)) {
      parent.set(id, null);
      dfs(id);
    }
  }
  return Array.from(articulation);
}

/**
 * Builds the org network graph from reporting relationships (formal
 * hierarchy) plus a collaboration graph derived from shared 1:1 topics —
 * i.e. people who co-appear around the same workstreams/events.
 */
export function buildOrgNetwork(people: PersonState[]): OrgNetworkGraph {
  const nodeIds = people.map((p) => p.id);
  const byId = new Map(people.map((p) => [p.id, p]));

  const edges: NetworkEdge[] = [];
  const directed: { from: string; to: string }[] = [];
  const undirected: { a: string; b: string }[] = [];

  // Reports-to edges (report -> manager)
  for (const p of people) {
    if (p.reportsTo && byId.has(p.reportsTo)) {
      edges.push({ from: p.id, to: p.reportsTo, type: 'reports_to', strength: 1 });
      directed.push({ from: p.id, to: p.reportsTo });
      undirected.push({ a: p.id, b: p.reportsTo });
    }
  }

  // Collaboration edges from shared 1:1 topics (co-appearance in the same workstream)
  const topicSets = new Map<string, Set<string>>();
  people.forEach((p) => topicSets.set(p.id, new Set(p.oneOnes.flatMap((o) => o.topics))));

  const collabPairs = new Map<string, number>();
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i].id;
      const b = people[j].id;
      const setA = topicSets.get(a)!;
      const setB = topicSets.get(b)!;
      let shared = 0;
      setA.forEach((t) => {
        if (setB.has(t)) shared++;
      });
      if (shared > 0) collabPairs.set(`${a}|${b}`, shared);
    }
  }

  // Succession nominations are explicit relationships — also collaboration edges.
  people.forEach((p) => {
    p.successors.forEach((s) => {
      const key = [p.id, s].sort().join('|');
      collabPairs.set(key, Math.max(collabPairs.get(key) || 0, 3));
    });
  });

  collabPairs.forEach((sharedCount, key) => {
    const [a, b] = key.split('|');
    const strength = Math.min(1, sharedCount / 3);
    edges.push({ from: a, to: b, type: 'collaboration', strength });
    directed.push({ from: a, to: b }, { from: b, to: a });
    undirected.push({ a, b });
  });

  // PageRank over the full directed graph (reports_to + bidirectional collaboration)
  const pr = pageRank(nodeIds, directed);
  const maxPageRank = Math.max(...Object.values(pr), 0.0001);

  // Clusters derived from the COLLABORATION graph only (informal network / silos)
  const uf = new UnionFind();
  nodeIds.forEach((id) => uf.init(id));
  edges.filter((e) => e.type === 'collaboration').forEach((e) => uf.union(e.from, e.to));

  const groups = new Map<string, string[]>();
  nodeIds.forEach((id) => {
    const root = uf.find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(id);
  });

  const clusters: NetworkCluster[] = [];
  const clusterOf: Record<string, string> = {};
  let clusterCounter = 0;
  groups.forEach((members) => {
    clusterCounter++;
    const clusterId = `cluster-${clusterCounter}`;
    members.forEach((m) => (clusterOf[m] = clusterId));
    // Label by common manager if one exists among members
    const managers = new Set(members.map((m) => byId.get(m)?.reportsTo).filter(Boolean));
    const label = members.length === 1 ? `${byId.get(members[0])?.name} (solo)` : managers.size === 1 ? `Team ${byId.get(Array.from(managers)[0] as string)?.name ?? Array.from(managers)[0]}` : `Cluster ${clusterCounter}`;

    const collabEdgesInCluster = edges.filter(
      (e) => e.type === 'collaboration' && clusterOf[e.from] === clusterId && clusterOf[e.to] === clusterId,
    );
    const possiblePairs = (members.length * (members.length - 1)) / 2;
    const cohesionScore = possiblePairs > 0 ? Math.min(1, collabEdgesInCluster.length / possiblePairs) : members.length === 1 ? 0 : 1;

    clusters.push({ id: clusterId, memberIds: members, label, cohesionScore });
  });

  const isolatedNodes = clusters.filter((c) => c.memberIds.length === 1).flatMap((c) => c.memberIds);

  // Bridges = articulation points over the FULL graph (hierarchy keeps org connected)
  const bridges = findArticulationPoints(nodeIds, undirected);

  // neighborClusters: distinct clusters each node is directly adjacent to (via any edge)
  const neighborClusters: Record<string, Set<string>> = {};
  nodeIds.forEach((id) => (neighborClusters[id] = new Set()));
  edges.forEach((e) => {
    const clusterFrom = clusterOf[e.from];
    const clusterTo = clusterOf[e.to];
    if (clusterFrom !== clusterTo) {
      neighborClusters[e.from].add(clusterTo);
      neighborClusters[e.to].add(clusterFrom);
    }
  });

  const largestClusterSize = Math.max(1, ...clusters.map((c) => c.memberIds.length));
  const knowledgeSiloIndex = clusters.length <= 1 ? 0 : 1 - largestClusterSize / nodeIds.length;

  const nodes: NetworkNode[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    title: p.title,
    centrality: maxPageRank > 0 ? Math.min(1, pr[p.id] / maxPageRank) : 0,
    cluster: clusterOf[p.id],
  }));

  return {
    nodes,
    edges,
    pageRankScores: pr,
    maxPageRank,
    clusters,
    isolatedNodes,
    bridges,
    knowledgeSiloIndex,
    neighborClusters,
    clusterOf,
  };
}
