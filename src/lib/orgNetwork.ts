// src/lib/orgNetwork.ts
//
// BASE MODULE + Part-3 extensions. No prior orgNetwork.ts existed in this
// checkout (see provenance note in src/lib/types.ts), so this file
// contains both the foundational report builder ("Part 2"-equivalent,
// section A below) and the two Part-3 additions the brief asks for
// (section B): detectNetworkAnomalies, computeKnowledgeSiloIndex.
// Every existing export below must be preserved by future extensions.

import type { OrgNetworkEdge, OrgNetworkNode, OrgNetworkReport, PersonId, PersonRecord } from "./types";

export type { OrgNetworkEdge, OrgNetworkNode, OrgNetworkReport } from "./types";

// =======================================================================
// SECTION A — base network report (foundational, pre-Part-3)
// =======================================================================

const PAGERANK_DAMPING = 0.85;
const PAGERANK_ITERATIONS = 50;

/**
 * Weighted PageRank-style centrality over the collaboration graph.
 * CITATION: standard PageRank power-iteration formula
 *   PR(v) = (1-d)/N + d * Σ_{u→v} PR(u) * w(u,v) / outWeight(u)
 * (Page, Brin, Motwani, Winograd 1998 — general algorithm, not borrowed
 * from any file in this repo since none existed). Treated as undirected
 * by inserting both directions with the same weight.
 * Caller: buildOrgNetworkReport (below, 1 call site).
 */
function computeCentrality(people: PersonRecord[], edges: OrgNetworkEdge[]): Map<PersonId, number> {
  const ids = people.map((p) => p.id);
  const n = ids.length;
  const centrality = new Map<PersonId, number>();
  if (n === 0) return centrality;

  const adjacency = new Map<PersonId, Array<{ to: PersonId; weight: number }>>();
  for (const id of ids) adjacency.set(id, []);
  for (const e of edges) {
    if (!adjacency.has(e.source) || !adjacency.has(e.target)) continue;
    adjacency.get(e.source)!.push({ to: e.target, weight: e.weight });
    adjacency.get(e.target)!.push({ to: e.source, weight: e.weight });
  }

  const outWeight = new Map<PersonId, number>();
  for (const id of ids) {
    outWeight.set(id, adjacency.get(id)!.reduce((sum, a) => sum + a.weight, 0));
  }

  let scores = new Map<PersonId, number>(ids.map((id) => [id, 1 / n]));

  for (let iter = 0; iter < PAGERANK_ITERATIONS; iter++) {
    const next = new Map<PersonId, number>();
    for (const id of ids) next.set(id, (1 - PAGERANK_DAMPING) / n);
    for (const id of ids) {
      const ow = outWeight.get(id) ?? 0;
      if (ow === 0) continue;
      const score = scores.get(id) ?? 0;
      for (const { to, weight } of adjacency.get(id)!) {
        next.set(to, (next.get(to) ?? 0) + PAGERANK_DAMPING * score * (weight / ow));
      }
    }
    scores = next;
  }

  const maxScore = Math.max(...Array.from(scores.values()), 1e-9);
  for (const id of ids) {
    centrality.set(id, maxScore > 0 ? (scores.get(id) ?? 0) / maxScore : 0);
  }
  return centrality;
}

/**
 * Builds the full org network report: per-node centrality, isolated-node
 * count (degree 0), and "bridge" people (centrality > 0.6).
 * Callers: src/lib/talentEngine.ts (profile building, team chemistry),
 * src/app/api/people/intelligence/route.ts — 2+ call sites.
 */
export function buildOrgNetworkReport(people: PersonRecord[], edges: OrgNetworkEdge[]): OrgNetworkReport {
  const centrality = computeCentrality(people, edges);
  const degree = new Map<PersonId, number>(people.map((p) => [p.id, 0]));
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  const nodes: OrgNetworkNode[] = people.map((p) => ({
    personId: p.id,
    centrality: centrality.get(p.id) ?? 0,
    degree: degree.get(p.id) ?? 0,
  }));

  const isolatedCount = nodes.filter((n) => n.degree === 0).length;
  const bridgeIds = nodes.filter((n) => n.centrality > 0.6).map((n) => n.personId);

  return {
    nodes,
    edges,
    isolatedCount,
    bridgeIds,
    generatedAt: new Date().toISOString(),
  };
}

// =======================================================================
// SECTION B — Part 3 additions
// =======================================================================

export interface NetworkAnomaly {
  type: "new_bottleneck" | "isolation_spike" | "bridge_loss" | "cluster_split" | "centrality_shift";
  personId: PersonId | null;
  description: string;
  severity: 1 | 2 | 3;
}

/**
 * Compares the current network report against a previous snapshot to
 * surface structural anomalies. Thresholds are quoted directly from the
 * brief: new_bottleneck (+0.15 centrality jump), isolation_spike
 * (isolatedCount +2), bridge_loss (was >0.6 centrality, now missing from
 * the active roster), centrality_shift (any |Δcentrality| > 0.2).
 * cluster_split is UNVERIFIED (original heuristic, this session): flagged
 * when the number of connected components grows by 2 or more between
 * snapshots (computed via the same union-find used in
 * computeKnowledgeSiloIndex below).
 * Caller: src/app/api/people/intelligence/route.ts (1 call site).
 */
export function detectNetworkAnomalies(
  report: OrgNetworkReport,
  previousReport: OrgNetworkReport | null
): NetworkAnomaly[] {
  const anomalies: NetworkAnomaly[] = [];
  if (!previousReport) return anomalies;

  const prevCentrality = new Map<PersonId, number>(previousReport.nodes.map((n) => [n.personId, n.centrality]));
  const currentIds = new Set(report.nodes.map((n) => n.personId));

  for (const node of report.nodes) {
    const prev = prevCentrality.get(node.personId);
    if (prev === undefined) continue;
    const delta = node.centrality - prev;

    if (delta > 0.15) {
      anomalies.push({
        type: "new_bottleneck",
        personId: node.personId,
        description: `Centrality jumped by ${delta.toFixed(2)} — now sits on the critical path.`,
        severity: 3,
      });
    }

    if (Math.abs(delta) > 0.2) {
      anomalies.push({
        type: "centrality_shift",
        personId: node.personId,
        description: `Centrality shifted by ${delta.toFixed(2)} since last snapshot.`,
        severity: 2,
      });
    }
  }

  if (report.isolatedCount - previousReport.isolatedCount > 2) {
    anomalies.push({
      type: "isolation_spike",
      personId: null,
      description: `Isolated-node count rose from ${previousReport.isolatedCount} to ${report.isolatedCount}.`,
      severity: 2,
    });
  }

  for (const prevNode of previousReport.nodes) {
    if (prevNode.centrality > 0.6 && !currentIds.has(prevNode.personId)) {
      anomalies.push({
        type: "bridge_loss",
        personId: prevNode.personId,
        description: `A former network bridge (centrality ${prevNode.centrality.toFixed(2)}) is no longer active.`,
        severity: 3,
      });
    }
  }

  const prevComponents = countConnectedComponents(previousReport.nodes.map((n) => n.personId), previousReport.edges);
  const currentComponents = countConnectedComponents(report.nodes.map((n) => n.personId), report.edges);
  if (currentComponents - prevComponents >= 2) {
    anomalies.push({
      type: "cluster_split",
      personId: null,
      description: `Collaboration graph fragmented from ${prevComponents} to ${currentComponents} connected clusters.`,
      severity: 2,
    });
  }

  return anomalies;
}

function countConnectedComponents(ids: PersonId[], edges: OrgNetworkEdge[], minWeight = 0.3): number {
  const parent = new Map<PersonId, PersonId>();
  const find = (x: PersonId): PersonId => {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== cur) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: PersonId, b: PersonId) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const id of ids) find(id);
  for (const e of edges) {
    if (e.weight > minWeight && parent.has(e.source) && parent.has(e.target)) {
      union(e.source, e.target);
    }
  }

  const roots = new Set(ids.map((id) => find(id)));
  return roots.size;
}

/**
 * Knowledge Silo Index (KSI): 0-1, higher = more siloed. Algorithm quoted
 * directly from the brief: build the undirected graph using only
 * collaboration edges with weight > 0.3, find connected components, and
 * KSI = 1 - (largest component size / total nodes). A single component
 * (fully connected org) yields KSI = 0. Feeds beliefFabric's
 * knowledgeSiloIndex observable (surfaced directly in
 * PeopleIntelligenceReport.knowledgeSiloIndex by the API route since this
 * session's beliefFabric.ts does not persist a time-series observable
 * store — see src/lib/beliefFabric.ts provenance note).
 * Caller: src/app/api/people/intelligence/route.ts (1 call site).
 */
export function computeKnowledgeSiloIndex(people: PersonRecord[], edges: OrgNetworkEdge[]): number {
  const ids = people.map((p) => p.id);
  const totalNodes = ids.length;
  if (totalNodes === 0) return 0;

  const parent = new Map<PersonId, PersonId>();
  const find = (x: PersonId): PersonId => {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== cur) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: PersonId, b: PersonId) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const id of ids) find(id);
  for (const e of edges) {
    if (e.weight > 0.3 && parent.has(e.source) && parent.has(e.target)) {
      union(e.source, e.target);
    }
  }

  const componentSizes = new Map<PersonId, number>();
  for (const id of ids) {
    const root = find(id);
    componentSizes.set(root, (componentSizes.get(root) ?? 0) + 1);
  }

  if (componentSizes.size <= 1) return 0;

  const largest = Math.max(...Array.from(componentSizes.values()));
  return Math.max(0, Math.min(1, 1 - largest / totalNodes));
}
