// Part 8 — Knowledge Architecture
// ---------------------------------------------------------------------------
// The knowledge graph is the central intelligence store for Leados. Every
// agent cycle (rule evaluation, belief updates, decisions, playbook runs)
// writes a node and/or edge here. Every view (Knowledge, Memory, Playbooks,
// Docs) reads from it. This module owns:
//
//   - low level node/edge CRUD + subgraph retrieval
//   - findRootCauses: backward causal-chain traversal
//   - findSimilarPastPatterns: Jaccard-similarity pattern matching
//   - buildInstitutionalMemoryDigest: org-level "what do we know" rollup
//
// All DB access goes through Drizzle (`@/db`), operating on the
// `leadosMemoryNodes` / `leadosMemoryEdges` tables (plus the findings and
// decisions ledgers that feed those nodes).

import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import type { db as DbClient } from "@/db";
import {
  leadosDecisions,
  leadosFindings,
  leadosMemoryEdges,
  leadosMemoryNodes,
} from "@/db/schema";
import {
  ALL_DOMAINS,
  type DecisionLedgerEntry,
  type Domain,
  type Finding,
  type GraphSubgraph,
  type InstitutionalMemoryDigest,
  type KnowledgeGap,
  type MemoryEdge,
  type MemoryNode,
  type NodeType,
  type PatternMatch,
  type RelationType,
  type RepeatingPattern,
  type RootCauseAnalysis,
} from "@/lib/types";

type Db = typeof DbClient;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / DAY_MS;
}

function toIso(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

function rowToNode(row: typeof leadosMemoryNodes.$inferSelect): MemoryNode {
  return {
    id: row.id,
    key: row.key,
    type: row.type as NodeType,
    label: row.label,
    domain: row.domain,
    severity: row.severity,
    tags: row.tags ?? [],
    importance: row.importance,
    metadata: row.metadata ?? {},
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function rowToEdge(row: typeof leadosMemoryEdges.$inferSelect): MemoryEdge {
  return {
    id: row.id,
    sourceId: row.sourceId,
    targetId: row.targetId,
    relation: row.relation as RelationType,
    weight: row.weight,
    createdAt: toIso(row.createdAt),
  };
}

// ---------------------------------------------------------------------------
// Low level CRUD
// ---------------------------------------------------------------------------

export async function getNodeByKey(db: Db, key: string): Promise<MemoryNode | null> {
  const rows = await db.select().from(leadosMemoryNodes).where(eq(leadosMemoryNodes.key, key)).limit(1);
  return rows[0] ? rowToNode(rows[0]) : null;
}

export async function getNodeById(db: Db, id: number): Promise<MemoryNode | null> {
  const rows = await db.select().from(leadosMemoryNodes).where(eq(leadosMemoryNodes.id, id)).limit(1);
  return rows[0] ? rowToNode(rows[0]) : null;
}

export async function getNodesByIds(db: Db, ids: number[]): Promise<MemoryNode[]> {
  if (ids.length === 0) return [];
  const rows = await db.select().from(leadosMemoryNodes).where(inArray(leadosMemoryNodes.id, ids));
  return rows.map(rowToNode);
}

export interface UpsertNodeInput {
  key: string;
  type: NodeType;
  label: string;
  domain: Domain | string;
  severity?: number | null;
  tags?: string[];
  importance?: number;
  metadata?: Record<string, unknown>;
}

export async function upsertNode(db: Db, input: UpsertNodeInput): Promise<MemoryNode> {
  const existing = await getNodeByKey(db, input.key);
  if (existing) {
    const rows = await db
      .update(leadosMemoryNodes)
      .set({
        label: input.label,
        domain: input.domain,
        severity: input.severity ?? existing.severity,
        tags: input.tags ?? existing.tags,
        importance: input.importance ?? existing.importance,
        metadata: input.metadata ?? existing.metadata,
        updatedAt: new Date(),
      })
      .where(eq(leadosMemoryNodes.id, existing.id))
      .returning();
    return rowToNode(rows[0]);
  }
  const rows = await db
    .insert(leadosMemoryNodes)
    .values({
      key: input.key,
      type: input.type,
      label: input.label,
      domain: input.domain,
      severity: input.severity ?? null,
      tags: input.tags ?? [],
      importance: input.importance ?? 0.1,
      metadata: input.metadata ?? {},
    })
    .returning();
  return rowToNode(rows[0]);
}

export interface AddEdgeInput {
  sourceKey: string;
  targetKey: string;
  relation: RelationType;
  weight?: number;
}

export async function addEdgeByKeys(db: Db, input: AddEdgeInput): Promise<MemoryEdge | null> {
  const [source, target] = await Promise.all([
    getNodeByKey(db, input.sourceKey),
    getNodeByKey(db, input.targetKey),
  ]);
  if (!source || !target) return null;
  const rows = await db
    .insert(leadosMemoryEdges)
    .values({
      sourceId: source.id,
      targetId: target.id,
      relation: input.relation,
      weight: input.weight ?? 1,
    })
    .returning();
  return rowToEdge(rows[0]);
}

export async function getOutgoingEdges(db: Db, nodeId: number, relation?: RelationType): Promise<MemoryEdge[]> {
  const condition = relation
    ? and(eq(leadosMemoryEdges.sourceId, nodeId), eq(leadosMemoryEdges.relation, relation))
    : eq(leadosMemoryEdges.sourceId, nodeId);
  const rows = await db.select().from(leadosMemoryEdges).where(condition);
  return rows.map(rowToEdge);
}

export async function getIncomingEdges(db: Db, nodeId: number, relation?: RelationType): Promise<MemoryEdge[]> {
  const condition = relation
    ? and(eq(leadosMemoryEdges.targetId, nodeId), eq(leadosMemoryEdges.relation, relation))
    : eq(leadosMemoryEdges.targetId, nodeId);
  const rows = await db.select().from(leadosMemoryEdges).where(condition);
  return rows.map(rowToEdge);
}

// ---------------------------------------------------------------------------
// Subgraph retrieval (for the Graph Explorer view)
// ---------------------------------------------------------------------------

export interface GraphSubgraphOptions {
  sinceDays?: number;
  nodeLimit?: number;
  edgeLimit?: number;
}

export async function getGraphSubgraph(db: Db, options: GraphSubgraphOptions = {}): Promise<GraphSubgraph> {
  const sinceDays = options.sinceDays ?? 90;
  const nodeLimit = options.nodeLimit ?? 200;
  const edgeLimit = options.edgeLimit ?? 500;
  const since = new Date(Date.now() - sinceDays * DAY_MS);

  const nodeRows = await db
    .select()
    .from(leadosMemoryNodes)
    .where(gte(leadosMemoryNodes.createdAt, since))
    .orderBy(desc(leadosMemoryNodes.importance))
    .limit(nodeLimit);

  const nodes = nodeRows.map(rowToNode);
  const nodeIds = new Set(nodes.map((n) => n.id));

  let edges: MemoryEdge[] = [];
  if (nodeIds.size > 0) {
    const edgeRows = await db
      .select()
      .from(leadosMemoryEdges)
      .where(inArray(leadosMemoryEdges.sourceId, Array.from(nodeIds)))
      .orderBy(desc(leadosMemoryEdges.createdAt))
      .limit(edgeLimit);
    edges = edgeRows.map(rowToEdge).filter((e) => nodeIds.has(e.targetId));
  }

  return {
    nodes,
    edges,
    generatedAt: new Date().toISOString(),
    windowDays: sinceDays,
  };
}

// ---------------------------------------------------------------------------
// Root cause analysis
//
// Algorithm: BFS backward from the finding node, following only edges where
// relation = 'caused' (edge semantics: source "caused" target). To walk
// backward from an effect to its cause we look up edges whose *target* is
// the current node, and move to their *source*. Root nodes are nodes with
// no incoming 'caused' edge anywhere in the graph (not just within the
// discovered chain) — i.e. nothing in the whole graph is recorded as having
// caused them.
// ---------------------------------------------------------------------------

export async function findRootCauses(findingKey: string, db: Db): Promise<RootCauseAnalysis> {
  const finding = await getNodeByKey(db, findingKey);
  if (!finding) {
    throw new Error(`findRootCauses: no memory node found for key "${findingKey}"`);
  }

  const visited = new Map<number, number>(); // nodeId -> hops from finding
  visited.set(finding.id, 0);
  const chainIds: number[] = [finding.id];

  let frontier = [finding.id];
  let hops = 0;
  let maxHops = 0;

  while (frontier.length > 0) {
    hops += 1;
    const nextFrontier: number[] = [];
    for (const nodeId of frontier) {
      const incomingCaused = await getIncomingEdges(db, nodeId, "caused");
      for (const edge of incomingCaused) {
        if (!visited.has(edge.sourceId)) {
          visited.set(edge.sourceId, hops);
          chainIds.push(edge.sourceId);
          nextFrontier.push(edge.sourceId);
          maxHops = Math.max(maxHops, hops);
        }
      }
    }
    frontier = nextFrontier;
    // Safety valve against pathological graphs/cycles.
    if (hops > 50) break;
  }

  const chainNodes = await getNodesByIds(db, chainIds);
  const byId = new Map(chainNodes.map((n) => [n.id, n]));
  const causalChain = chainIds.map((id) => byId.get(id)).filter((n): n is MemoryNode => Boolean(n));

  // A node is a "root" if nothing in the *whole graph* caused it.
  const rootNodes: MemoryNode[] = [];
  for (const node of causalChain) {
    const incoming = await getIncomingEdges(db, node.id, "caused");
    if (incoming.length === 0) rootNodes.push(node);
  }
  // The finding itself is never considered a root unless it is the only node.
  const rootNodesFiltered = rootNodes.length > 1 ? rootNodes.filter((n) => n.id !== finding.id) : rootNodes;

  const contributingDecisions = causalChain.filter((n) => n.type === "decision");
  const affectedPeople = causalChain.filter((n) => n.type === "person");

  // DESIGN PARAMETER: confidence halves roughly every ~6.5 hops (0.9^hops).
  const confidenceDecay = Math.pow(0.9, maxHops);

  const rootNames = rootNodesFiltered.length > 0 ? rootNodesFiltered.map((n) => n.label).join(", ") : "an unknown upstream factor";
  const narrative =
    `This finding traces to ${rootNodesFiltered.length || 1} root cause(s): ${rootNames}. ` +
    `The path runs through ${causalChain.length} step(s) involving ${contributingDecisions.length} decision(s) and ${affectedPeople.length} person(s).`;

  return {
    finding,
    causalChain,
    rootNodes: rootNodesFiltered,
    contributingDecisions,
    affectedPeople,
    confidenceDecay,
    narrative,
  };
}

// ---------------------------------------------------------------------------
// Pattern matching against history
//
// Jaccard similarity of two tag sets A and B:
//
//     J(A, B) = |A ∩ B| / |A ∪ B|
//
// ---------------------------------------------------------------------------
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a.map((t) => t.toLowerCase()));
  const setB = new Set(b.map((t) => t.toLowerCase()));
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const tag of setA) {
    if (setB.has(tag)) intersection += 1;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export async function findSimilarPastPatterns(
  currentFinding: Finding,
  db: Db,
  lookbackDays: number = 365,
): Promise<PatternMatch[]> {
  const since = new Date(Date.now() - lookbackDays * DAY_MS);
  const rows = await db
    .select()
    .from(leadosMemoryNodes)
    .where(and(eq(leadosMemoryNodes.type, "finding"), gte(leadosMemoryNodes.createdAt, since)));

  const historicalNodes = rows
    .map(rowToNode)
    .filter((n) => n.key !== currentFinding.key && Number(n.metadata.findingId) !== currentFinding.id);

  const matches: PatternMatch[] = [];
  for (const node of historicalNodes) {
    const domainMatch = node.domain === currentFinding.domain ? 1 : 0;
    const severityMatch = node.severity === currentFinding.severity ? 1 : 0;
    const similarity = jaccardSimilarity(currentFinding.tags, node.tags) + 0.3 * domainMatch + 0.2 * severityMatch;

    let resolvedHow: string | null = null;
    let resolutionDays: number | null = null;
    const resolvedEdges = await getOutgoingEdges(db, node.id, "resolved");
    if (resolvedEdges.length > 0) {
      const target = await getNodeById(db, resolvedEdges[0].targetId);
      if (target) {
        resolvedHow = target.label;
        resolutionDays = daysBetween(new Date(resolvedEdges[0].createdAt), new Date(node.createdAt));
      }
    }

    if (similarity > 0) {
      matches.push({ node, similarity, resolvedHow, resolutionDays });
    }
  }

  matches.sort((a, b) => b.similarity - a.similarity);
  return matches.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Institutional memory digest
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function buildDecisionLedger(db: Db): Promise<DecisionLedgerEntry[]> {
  const all = await db.select().from(leadosDecisions).orderBy(desc(leadosDecisions.decidedAt));
  return all
    .filter((d) => d.outcome !== null)
    .map((d) => {
      const daysToOutcome = d.outcomeAt ? daysBetween(new Date(d.outcomeAt), new Date(d.decidedAt)) : null;
      const actual = d.outcome ? 1 : 0;
      const confidenceError = d.outcome !== null ? Math.abs(actual - d.confidenceAtDecision) : null;
      return {
        id: d.id,
        key: d.key,
        label: d.label,
        domain: d.domain,
        outcome: d.outcome,
        daysToOutcome,
        confidenceAtDecision: d.confidenceAtDecision,
        confidenceError,
      } satisfies DecisionLedgerEntry;
    });
}

async function buildRepeatingPatterns(db: Db): Promise<RepeatingPattern[]> {
  const since = new Date(Date.now() - 365 * DAY_MS);
  const rows = await db
    .select()
    .from(leadosMemoryNodes)
    .where(and(eq(leadosMemoryNodes.type, "finding"), gte(leadosMemoryNodes.createdAt, since)));
  const nodes = rows.map(rowToNode);

  const groups = new Map<string, MemoryNode[]>();
  for (const node of nodes) {
    const ruleKey = String(node.metadata.ruleKey ?? node.key.split(":")[0] ?? "unknown");
    const list = groups.get(ruleKey) ?? [];
    list.push(node);
    groups.set(ruleKey, list);
  }

  const patterns: RepeatingPattern[] = [];
  for (const [ruleKey, groupNodes] of groups) {
    if (groupNodes.length < 3) continue;
    const sorted = [...groupNodes].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const avgSeverity = sorted.reduce((sum, n) => sum + (n.severity ?? 0), 0) / sorted.length;

    const resolutionDurations: number[] = [];
    for (const node of sorted) {
      const resolvedEdges = await getOutgoingEdges(db, node.id, "resolved");
      if (resolvedEdges.length > 0) {
        resolutionDurations.push(daysBetween(new Date(resolvedEdges[0].createdAt), new Date(node.createdAt)));
      }
    }
    const avgResolutionDays = resolutionDurations.length > 0 ? resolutionDurations.reduce((a, b) => a + b, 0) / resolutionDurations.length : null;

    const half = Math.floor(sorted.length / 2) || 1;
    const earlier = sorted.slice(0, half);
    const later = sorted.slice(half);
    const earlierAvg = earlier.reduce((sum, n) => sum + (n.severity ?? 0), 0) / earlier.length;
    const laterAvg = later.length > 0 ? later.reduce((sum, n) => sum + (n.severity ?? 0), 0) / later.length : earlierAvg;
    let trend: RepeatingPattern["trend"] = "flat";
    if (laterAvg - earlierAvg > 0.3) trend = "worsening";
    else if (earlierAvg - laterAvg > 0.3) trend = "improving";

    patterns.push({
      ruleKey,
      label: sorted[sorted.length - 1].label,
      domain: sorted[sorted.length - 1].domain,
      occurrences: sorted.length,
      avgSeverity,
      avgResolutionDays,
      trend,
    });
  }

  patterns.sort((a, b) => b.occurrences - a.occurrences);
  return patterns;
}

async function buildUnresolvedChronicIssues(db: Db): Promise<MemoryNode[]> {
  const threshold = new Date(Date.now() - 90 * DAY_MS);
  const rows = await db
    .select()
    .from(leadosMemoryNodes)
    .where(and(eq(leadosMemoryNodes.type, "finding"), lt(leadosMemoryNodes.createdAt, threshold)));
  const candidates = rows.map(rowToNode);

  const chronic: MemoryNode[] = [];
  for (const node of candidates) {
    const resolved = await getOutgoingEdges(db, node.id, "resolved");
    if (resolved.length === 0) chronic.push(node);
  }
  chronic.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return chronic;
}

async function computeKnowledgeHalfLife(db: Db): Promise<number> {
  const nodeRows = await db.select().from(leadosMemoryNodes);
  const edgeRows = await db.select().from(leadosMemoryEdges);

  const lastOutgoingByNode = new Map<number, number>();
  for (const edge of edgeRows) {
    const ts = new Date(edge.createdAt).getTime();
    const current = lastOutgoingByNode.get(edge.sourceId);
    if (!current || ts > current) lastOutgoingByNode.set(edge.sourceId, ts);
  }

  const ages: number[] = [];
  const now = Date.now();
  for (const node of nodeRows) {
    const lastEdgeTs = lastOutgoingByNode.get(node.id);
    if (lastEdgeTs) {
      ages.push((now - lastEdgeTs) / DAY_MS);
    }
  }
  return median(ages);
}

async function computeKnowledgeGaps(db: Db): Promise<KnowledgeGap[]> {
  const rows = await db.select().from(leadosMemoryNodes);
  const nodes = rows.map(rowToNode);

  const gaps: KnowledgeGap[] = [];
  for (const domain of ALL_DOMAINS) {
    const domainNodes = nodes.filter((n) => n.domain === domain);
    const nodeCount = domainNodes.length;
    let mostRecentNodeAgeDays: number | null = null;
    if (domainNodes.length > 0) {
      const mostRecent = domainNodes.reduce((latest, n) =>
        new Date(n.createdAt).getTime() > new Date(latest.createdAt).getTime() ? n : latest,
      );
      mostRecentNodeAgeDays = (Date.now() - new Date(mostRecent.createdAt).getTime()) / DAY_MS;
    }
    const tooFew = nodeCount < 5;
    const stale = mostRecentNodeAgeDays === null || mostRecentNodeAgeDays > 30;
    if (tooFew || stale) {
      gaps.push({
        domain,
        nodeCount,
        mostRecentNodeAgeDays,
        reason: tooFew && stale ? "both" : tooFew ? "too_few_nodes" : "stale",
      });
    }
  }
  gaps.sort((a, b) => a.nodeCount - b.nodeCount);
  return gaps;
}

export async function buildInstitutionalMemoryDigest(db: Db): Promise<InstitutionalMemoryDigest> {
  const [decisionsWithOutcomes, repeatingPatterns, unresolvedChronicIssues, knowledgeHalfLife, topKnowledgeGaps] =
    await Promise.all([
      buildDecisionLedger(db),
      buildRepeatingPatterns(db),
      buildUnresolvedChronicIssues(db),
      computeKnowledgeHalfLife(db),
      computeKnowledgeGaps(db),
    ]);

  return {
    decisionsWithOutcomes,
    repeatingPatterns,
    unresolvedChronicIssues,
    knowledgeHalfLife,
    topKnowledgeGaps,
  };
}

// ---------------------------------------------------------------------------
// Convenience: load a Finding (ledger row) shaped for findSimilarPastPatterns
// ---------------------------------------------------------------------------
export async function getFindingByKey(db: Db, key: string): Promise<Finding | null> {
  const rows = await db.select().from(leadosFindings).where(eq(leadosFindings.key, key)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    ruleKey: row.ruleKey,
    title: row.title,
    description: row.description,
    domain: row.domain,
    severity: row.severity,
    tags: row.tags ?? [],
    status: row.status as Finding["status"],
    createdAt: toIso(row.createdAt),
    resolvedAt: row.resolvedAt ? toIso(row.resolvedAt) : null,
  };
}

export async function getFindingById(db: Db, id: number): Promise<Finding | null> {
  const rows = await db.select().from(leadosFindings).where(eq(leadosFindings.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    ruleKey: row.ruleKey,
    title: row.title,
    description: row.description,
    domain: row.domain,
    severity: row.severity,
    tags: row.tags ?? [],
    status: row.status as Finding["status"],
    createdAt: toIso(row.createdAt),
    resolvedAt: row.resolvedAt ? toIso(row.resolvedAt) : null,
  };
}
