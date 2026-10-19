// src/lib/knowledgeGraph.ts
//
// BOOTSTRAP NOTE: no prior knowledgeGraph.ts existed in the repository.
// This file defines the full node/edge/RelationType taxonomy (re-exported
// from types.ts, the single shared type root — no parallel hierarchy) plus
// CRUD helpers, and the Part-1-mandated `updateBeliefNodes`.

import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { memoryEdges, memoryNodes } from "@/db/schema";
import type {
  BeliefFabricResult,
  LatentNodeId,
  MemoryEdge,
  MemoryNode,
  MemoryNodeType,
  RelationType,
} from "./types";

export type { MemoryNode, MemoryEdge, MemoryNodeType, RelationType } from "./types";

type DbClient = typeof db;

function toMemoryNode(row: typeof memoryNodes.$inferSelect): MemoryNode {
  return {
    id: row.id,
    type: row.type as MemoryNodeType,
    key: row.key,
    label: row.label,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt ?? new Date(),
  };
}

// ---------------------------------------------------------------------------
// Node / edge CRUD
// ---------------------------------------------------------------------------

export async function findNodeByKey(key: string, dbClient: DbClient = db): Promise<MemoryNode | null> {
  const rows = await dbClient.select().from(memoryNodes).where(eq(memoryNodes.key, key)).limit(1);
  return rows[0] ? toMemoryNode(rows[0]) : null;
}

export async function upsertNode(
  type: MemoryNodeType,
  key: string,
  label: string,
  metadata: Record<string, unknown>,
  dbClient: DbClient = db,
): Promise<MemoryNode> {
  const existing = await findNodeByKey(key, dbClient);
  if (existing) {
    const merged = { ...existing.metadata, ...metadata };
    const rows = await dbClient
      .update(memoryNodes)
      .set({ label, metadata: merged })
      .where(eq(memoryNodes.id, existing.id))
      .returning();
    return toMemoryNode(rows[0]);
  }
  const rows = await dbClient
    .insert(memoryNodes)
    .values({ type, key, label, metadata })
    .returning();
  return toMemoryNode(rows[0]);
}

export async function createEdge(
  fromNodeId: number,
  toNodeId: number,
  relation: RelationType,
  metadata: Record<string, unknown> = {},
  dbClient: DbClient = db,
): Promise<MemoryEdge> {
  const rows = await dbClient
    .insert(memoryEdges)
    .values({ fromNodeId, toNodeId, relation, metadata })
    .returning();
  const row = rows[0];
  return {
    id: row.id,
    fromNodeId: row.fromNodeId,
    toNodeId: row.toNodeId,
    relation: row.relation as RelationType,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt ?? new Date(),
  };
}

export async function edgeExists(
  fromNodeId: number,
  toNodeId: number,
  relation: RelationType,
  dbClient: DbClient = db,
): Promise<boolean> {
  const rows = await dbClient
    .select({ id: memoryEdges.id })
    .from(memoryEdges)
    .where(
      and(
        eq(memoryEdges.fromNodeId, fromNodeId),
        eq(memoryEdges.toNodeId, toNodeId),
        eq(memoryEdges.relation, relation),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function createFinding(
  key: string,
  label: string,
  metadata: Record<string, unknown> = {},
  dbClient: DbClient = db,
): Promise<MemoryNode> {
  return upsertNode("finding", key, label, metadata, dbClient);
}

export async function getRecentFindings(hours: number, dbClient: DbClient = db): Promise<MemoryNode[]> {
  const cutoff = new Date(Date.now() - hours * 3_600_000);
  const rows = await dbClient
    .select()
    .from(memoryNodes)
    .where(and(eq(memoryNodes.type, "finding"), gte(memoryNodes.createdAt, cutoff)))
    .orderBy(desc(memoryNodes.createdAt));
  return rows.map(toMemoryNode);
}

// ---------------------------------------------------------------------------
// Part 1: updateBeliefNodes — refresh the knowledge graph from the belief
// fabric's output after every belief revision.
// ---------------------------------------------------------------------------

function beliefKey(nodeId: LatentNodeId): string {
  return `belief:${nodeId}`;
}

/** DESIGN PARAMETER thresholds, taken verbatim from the task spec:
 *  - cascadeRisk > 0.5 activates the "triggered" fan-in edges.
 *  - a latent posterior > 0.6 is considered a cascade contributor.
 */
const CASCADE_TRIGGER_THRESHOLD = 0.5;
const CASCADE_CONTRIBUTOR_THRESHOLD = 0.6;

export async function updateBeliefNodes(
  result: BeliefFabricResult,
  dbClient: DbClient = db,
): Promise<void> {
  // 1) Find-or-create an "insight" MemoryNode per latent node, keyed
  //    "belief:{nodeId}", and refresh its probability/confidence metadata.
  const nodeIds = Object.keys(result.posteriors) as LatentNodeId[];
  const insightNodes = new Map<LatentNodeId, MemoryNode>();

  for (const nodeId of nodeIds) {
    const marginal = result.posteriors[nodeId];
    const node = await upsertNode(
      "insight",
      beliefKey(nodeId),
      `Belief: ${nodeId}`,
      {
        probability: marginal.p,
        confidence: marginal.confidence,
        updatedAt: result.generatedAt,
      },
      dbClient,
    );
    insightNodes.set(nodeId, node);
  }

  // 2) cascadeRisk > 0.5 -> "triggered" edge from every latent node with
  //    posterior > 0.6 to the cascadeRisk insight node.
  if (result.cascadeRisk.p > CASCADE_TRIGGER_THRESHOLD) {
    const cascadeNode = insightNodes.get("cascadeRisk");
    if (cascadeNode) {
      for (const nodeId of nodeIds) {
        if (nodeId === "cascadeRisk") continue;
        if (result.posteriors[nodeId].p > CASCADE_CONTRIBUTOR_THRESHOLD) {
          const contributor = insightNodes.get(nodeId);
          if (contributor && !(await edgeExists(contributor.id, cascadeNode.id, "triggered", dbClient))) {
            await createEdge(
              contributor.id,
              cascadeNode.id,
              "triggered",
              { cascadeRiskAt: result.cascadeRisk.p },
              dbClient,
            );
          }
        }
      }
    }
  }

  // 3) dominantRisk -> "caused" edge to every Finding node created in the
  //    last 24h (provenance: "why is this finding showing?").
  const dominantNode = insightNodes.get(result.dominantRisk);
  if (dominantNode) {
    const recentFindings = await getRecentFindings(24, dbClient);
    for (const finding of recentFindings) {
      if (!(await edgeExists(dominantNode.id, finding.id, "caused", dbClient))) {
        await createEdge(
          dominantNode.id,
          finding.id,
          "caused",
          { dominantRiskDetail: result.dominantRiskDetail },
          dbClient,
        );
      }
    }
  }
}

export async function getNodesByIds(ids: number[], dbClient: DbClient = db): Promise<MemoryNode[]> {
  if (ids.length === 0) return [];
  const rows = await dbClient.select().from(memoryNodes).where(inArray(memoryNodes.id, ids));
  return rows.map(toMemoryNode);
}
