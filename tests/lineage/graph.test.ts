import { describe, it, expect } from "vitest";
import { traceLineage, type LineageNode, type LineageEdge } from "@/lib/platform/lineage/graph";

describe("Lineage graph — pure traversal", () => {
  const nodes: LineageNode[] = [
    { id: "src1", nodeType: "source", refTable: "raw_records", refId: "rr1", label: "CSV row 1" },
    { id: "tf1", nodeType: "transform", refTable: null, refId: null, label: "normalize:v1" },
    { id: "proj1", nodeType: "projection", refTable: "entities", refId: "e1", label: "entities.goldenRecord" },
    { id: "surf1", nodeType: "surface", refTable: null, refId: null, label: "surface:lead-detail" },
  ];
  const edges: LineageEdge[] = [
    { id: "ed1", fromNodeId: "src1", toNodeId: "tf1" },
    { id: "ed2", fromNodeId: "tf1", toNodeId: "proj1" },
    { id: "ed3", fromNodeId: "proj1", toNodeId: "surf1" },
  ];

  it("resolves a full source -> transform -> projection -> surface chain", () => {
    const result = traceLineage(nodes, edges);
    expect(result.found).toBe(true);
    expect(result.chains).toHaveLength(1);
    expect(result.chains[0].nodes.map((n) => n.nodeType)).toEqual(["source", "transform", "projection", "surface"]);
  });

  it("reports an incomplete chain honestly when a projection never reached a surface", () => {
    const partialEdges = edges.filter((e) => e.id !== "ed3");
    const result = traceLineage(nodes, partialEdges);
    expect(result.chains[0].nodes[result.chains[0].nodes.length - 1].nodeType).toBe("projection");
    expect(result.explanation).toMatch(/does not yet reach a surface/);
  });

  it("reports no lineage when there is no source node at all", () => {
    const result = traceLineage(nodes.filter((n) => n.nodeType !== "source"), edges);
    expect(result.found).toBe(false);
  });
});
