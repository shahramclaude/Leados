import { eq } from "drizzle-orm";
import { db } from "@/db";
import { valueChainEdges, valueChainNodes } from "@/db/schema";
import { computeCoverageReport, type ValueChainGraph } from "@/lib/industry/valueChain";
import { directGraphNotAvailableNotice } from "@/lib/seams/part31-ecosystem-graph";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const segmentId = searchParams.get("segmentId");

  const nodes = await db
    .select()
    .from(valueChainNodes)
    .where(segmentId ? eq(valueChainNodes.segmentId, Number(segmentId)) : undefined);

  const nodeIds = new Set(nodes.map((n) => n.id));
  const allEdges = await db.select().from(valueChainEdges);
  const edges = allEdges.filter((e) => nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId));

  const graph: ValueChainGraph = {
    nodes: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      tier: n.tier,
      role: n.role,
      revenueWeight: n.revenueWeight,
      dataConfidence: n.dataConfidence,
      isGapFilled: n.isGapFilled,
      evidenceClass: n.evidenceClass,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      fromNodeId: e.fromNodeId,
      toNodeId: e.toNodeId,
      relationship: e.relationship,
      dependencyWeight: e.dependencyWeight,
      correlatedShockGroup: e.correlatedShockGroup,
      evidenceClass: e.evidenceClass,
      isGapFilled: e.isGapFilled,
    })),
  };

  const coverage = computeCoverageReport(graph);

  return Response.json({ graph, coverage, notice: directGraphNotAvailableNotice() });
}
