import { NextRequest } from "next/server";
import { db } from "@/db";
import { leadosMemoryNodes, leadosInsights } from "@/db/schema";
import { sql } from "drizzle-orm";
import {
  loadGraph,
  queryGraph,
  findRelatedEntities,
  autoIngestEvent,
  type NodeType,
  type OrgEventInput,
  type RelationType,
} from "@/lib/knowledgeGraph";
import { ensureSeeded, refreshInsights } from "@/lib/seedOrgData";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q");
    const start = searchParams.get("start");
    const related = searchParams.get("related");
    const relatedType = searchParams.get("type") as NodeType | null;
    const depthParam = searchParams.get("depth");
    const relationParam = searchParams.get("relation");

    // Full-text search across all memory nodes, ranked by relevance + recency.
    if (q) {
      const query = q.trim().toLowerCase();
      const allNodes = await db.select().from(leadosMemoryNodes);
      const now = Date.now();
      const results = allNodes
        .map((n) => {
          const haystack = `${n.label} ${n.summary} ${n.tags.join(" ")}`.toLowerCase();
          if (!haystack.includes(query)) return null;
          const hitCount = haystack.split(query).length - 1;
          const ageDays = (now - new Date(n.createdAt).getTime()) / 86_400_000;
          const recencyScore = Math.max(0, 1 - ageDays / 90);
          return { node: n, score: Math.round((hitCount * 2 + recencyScore) * 100) / 100 };
        })
        .filter((x): x is { node: (typeof allNodes)[number]; score: number } => x !== null)
        .sort((a, b) => b.score - a.score);
      return Response.json({ results });
    }

    // findRelatedEntities(entityId, type?)
    if (related) {
      const entities = await findRelatedEntities(related, relatedType ?? undefined);
      return Response.json({ related: entities });
    }

    // queryGraph(startNode, relationFilter, depth)
    if (start) {
      const depth = depthParam ? parseInt(depthParam, 10) : 2;
      const relationFilter = relationParam ? (relationParam.split(",") as RelationType[]) : undefined;
      const subgraph = await queryGraph(parseInt(start, 10), relationFilter, Number.isFinite(depth) ? depth : 2);
      return Response.json(subgraph);
    }

    // Default: whole graph.
    const graph = await loadGraph();
    const insightCountRows = await db.select({ count: sql<number>`count(*)` }).from(leadosInsights);
    return Response.json({ ...graph, insightCount: Number(insightCountRows[0]?.count ?? 0) });
  } catch (err) {
    console.error("GET /api/memory failed", err);
    return Response.json({ error: "Failed to load memory graph" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body?.action === "ingest" && body.event) {
      const graph = await loadGraph();
      const result = await autoIngestEvent(body.event as OrgEventInput, graph);
      return Response.json(result);
    }

    if (body?.action === "regenerate-insights") {
      const inserted = await refreshInsights();
      return Response.json({ inserted });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("POST /api/memory failed", err);
    return Response.json({ error: "Failed to process request" }, { status: 500 });
  }
}
