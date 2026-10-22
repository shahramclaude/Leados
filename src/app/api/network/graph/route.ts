import { loadEcosystemGraph } from "@/lib/network/graph";
import type { EdgeType } from "@/lib/network/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const edgeTypeFilter = searchParams.get("edgeType") as EdgeType | null;

  const graph = await loadEcosystemGraph();

  const edges = edgeTypeFilter
    ? graph.edges.filter((e) => e.edgeType === edgeTypeFilter)
    : graph.edges;

  return Response.json({ nodes: graph.nodes, edges });
}
