import { loadEcosystemGraph, nodeLabel } from "@/lib/network/graph";
import { findChokePoints } from "@/lib/network/metrics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");
  const sink = searchParams.get("sink");

  const graph = await loadEcosystemGraph();

  if (!source || !sink) {
    // No pair supplied: default to scanning from the internal "hub" node(s)
    // (teams) to every external node, surfacing the most binding cut per pair.
    const hubs = graph.nodes.filter((n) => n.type === "internal_team");
    const externals = graph.nodes.filter((n) => n.isExternal);
    const scan = hubs.flatMap((hub) =>
      externals.map((ext) => {
        const result = findChokePoints(graph, hub.id, ext.id);
        return {
          source: hub.id,
          sourceName: hub.name,
          sink: ext.id,
          sinkName: ext.name,
          minCutValue: result.minCutValue,
          cutEdgeIds: result.cutEdgeIds,
        };
      }),
    );
    return Response.json({ mode: "scan", results: scan.sort((a, b) => a.minCutValue - b.minCutValue) });
  }

  const result = findChokePoints(graph, source, sink);
  const cutEdges = graph.edges
    .filter((e) => result.cutEdgeIds.includes(e.id))
    .map((e) => ({
      id: e.id,
      sourceName: nodeLabel(graph, e.source),
      targetName: nodeLabel(graph, e.target),
      edgeType: e.edgeType,
      strength: e.strength,
      substitutability: e.substitutability,
    }));

  return Response.json({
    mode: "pair",
    source,
    sourceName: nodeLabel(graph, source),
    sink,
    sinkName: nodeLabel(graph, sink),
    minCutValue: result.minCutValue,
    chokePoints: cutEdges,
  });
}
