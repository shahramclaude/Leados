// src/lib/knowledgeGraph.ts
//
// Stage 7 of the orchestration pipeline: org knowledge graph construction.
//
// Builds a lightweight graph of person/domain nodes connected by edges
// derived from active findings (person -> domain) and high-confidence
// causal links (domain -> domain). Needs person names, so it reads the
// `people` table directly (a genuinely new query vs. prior stages, which
// only operate on signals/findings).
import { inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import type { CausalChainResult, GraphEdge, GraphNode, OrgNetworkReport, SignalFusionResult } from "@/lib/types";

type Db = NodePgDatabase<typeof schema>;

export async function buildKnowledgeGraph(
  db: Db,
  now: Date,
  fusion: SignalFusionResult,
  causal: CausalChainResult,
): Promise<OrgNetworkReport> {
  const personIds = fusion.fusedSignals.map((f) => f.personId);
  const people = personIds.length > 0 ? await db.select().from(schema.people).where(inArray(schema.people.id, personIds)) : [];
  const peopleById = new Map(people.map((p) => [p.id, p]));

  const nodes: GraphNode[] = [];
  const nodeIds = new Set<string>();
  const edges: GraphEdge[] = [];

  const addNode = (node: GraphNode) => {
    if (!nodeIds.has(node.id)) {
      nodeIds.add(node.id);
      nodes.push(node);
    }
  };

  const domainsSeen = new Set<string>();

  for (const fused of fusion.fusedSignals) {
    const person = peopleById.get(fused.personId);
    const personNodeId = `person:${fused.personId}`;
    addNode({
      id: personNodeId,
      type: "person",
      label: person?.name ?? `Person ${fused.personId}`,
      weight: fused.riskScore,
    });

    for (const domain of fused.contributingDomains) {
      const domainNodeId = `domain:${domain}`;
      if (!domainsSeen.has(domain)) {
        domainsSeen.add(domain);
        addNode({ id: domainNodeId, type: "domain", label: domain, weight: 0 });
      }
      edges.push({
        source: personNodeId,
        target: domainNodeId,
        weight: fused.riskScore,
        kind: "finding",
      });
    }
  }

  for (const chain of causal.chains) {
    const fromId = `domain:${chain.fromDomain}`;
    const toId = `domain:${chain.toDomain}`;
    if (!domainsSeen.has(chain.fromDomain)) {
      domainsSeen.add(chain.fromDomain);
      addNode({ id: fromId, type: "domain", label: chain.fromDomain, weight: 0 });
    }
    if (!domainsSeen.has(chain.toDomain)) {
      domainsSeen.add(chain.toDomain);
      addNode({ id: toId, type: "domain", label: chain.toDomain, weight: 0 });
    }
    edges.push({
      source: fromId,
      target: toId,
      weight: chain.confidence * 100,
      kind: "causal",
    });
  }

  const n = nodes.length;
  const density = n > 1 ? Math.round((edges.length / (n * (n - 1))) * 1000) / 1000 : 0;

  return {
    computedAt: now.toISOString(),
    nodes,
    edges,
    density,
  };
}
