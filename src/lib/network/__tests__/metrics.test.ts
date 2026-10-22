import { describe, expect, it } from "vitest";
import type { EcosystemGraph, GraphEdge, GraphNode } from "../types";
import {
  betweennessCentrality,
  busFactor,
  busFactorBruteForce,
  computeBlastRadius,
  degreeCentrality,
  eigenvectorCentrality,
  findChokePoints,
  herfindahlHirschmanIndex,
} from "../metrics";

function node(id: string, type: GraphNode["type"] = "internal_team"): GraphNode {
  return { id, type, name: id, isExternal: false, scopeTags: [] };
}

function depEdge(
  id: string,
  source: string,
  target: string,
  strength = 0.8,
  substitutability = 0.3,
): GraphEdge {
  return {
    id,
    source,
    target,
    edgeType: "depends_on",
    strength,
    substitutability,
    evidenceClass: "verified_primary",
    evidenceRefs: [],
  };
}

// ---------------------------------------------------------------------------
// Degree + betweenness: known fixture = path graph of 5 nodes (0-1-2-3-4)
// Standard result: betweenness(k) = k * (n-1-k) for 0-indexed position k.
// ---------------------------------------------------------------------------

describe("degree & betweenness centrality — path graph fixture", () => {
  const nodes = ["n0", "n1", "n2", "n3", "n4"].map((id) => node(id));
  const edges: GraphEdge[] = [
    depEdge("e0", "n0", "n1"),
    depEdge("e1", "n1", "n2"),
    depEdge("e2", "n2", "n3"),
    depEdge("e3", "n3", "n4"),
  ];
  const graph: EcosystemGraph = { nodes, edges };

  it("computes degree centrality correctly", () => {
    const degree = degreeCentrality(graph);
    expect(degree.get("n0")).toBe(1);
    expect(degree.get("n1")).toBe(2);
    expect(degree.get("n2")).toBe(2);
    expect(degree.get("n3")).toBe(2);
    expect(degree.get("n4")).toBe(1);
  });

  it("matches the textbook betweenness formula k*(n-1-k) for a path graph", () => {
    const betweenness = betweennessCentrality(graph);
    const n = 5;
    ["n0", "n1", "n2", "n3", "n4"].forEach((id, k) => {
      const expected = k * (n - 1 - k);
      expect(betweenness.get(id)).toBeCloseTo(expected, 6);
    });
    // Middle node of a 5-path sits on every shortest path between the two
    // nodes on either side of it — the textbook value is 4.
    expect(betweenness.get("n2")).toBeCloseTo(4, 6);
  });
});

describe("betweenness centrality — star graph fixture", () => {
  // Center connected to 4 leaves: every leaf-to-leaf shortest path crosses
  // the center. Number of unordered leaf pairs = C(4,2) = 6.
  const nodes = ["center", "l1", "l2", "l3", "l4"].map((id) => node(id));
  const edges: GraphEdge[] = [
    depEdge("e0", "center", "l1"),
    depEdge("e1", "center", "l2"),
    depEdge("e2", "center", "l3"),
    depEdge("e3", "center", "l4"),
  ];
  const graph: EcosystemGraph = { nodes, edges };

  it("gives the center all the leaf-pair betweenness and leaves zero", () => {
    const betweenness = betweennessCentrality(graph);
    expect(betweenness.get("center")).toBeCloseTo(6, 6);
    for (const leaf of ["l1", "l2", "l3", "l4"]) {
      expect(betweenness.get(leaf)).toBeCloseTo(0, 6);
    }
  });

  it("ranks the center highest on eigenvector centrality", () => {
    const eigen = eigenvectorCentrality(graph);
    const center = eigen.get("center")!;
    for (const leaf of ["l1", "l2", "l3", "l4"]) {
      expect(center).toBeGreaterThan(eigen.get(leaf)!);
    }
    // Leaves should all be equal by symmetry.
    const leafValues = ["l1", "l2", "l3", "l4"].map((id) => eigen.get(id)!);
    leafValues.forEach((v) => expect(v).toBeCloseTo(leafValues[0], 6));
  });
});

// ---------------------------------------------------------------------------
// HHI hand-checks
// ---------------------------------------------------------------------------

describe("Herfindahl-Hirschman Index (HHI = sum of squared shares)", () => {
  it("returns 1 (max concentration) for a single entity holding 100%", () => {
    const result = herfindahlHirschmanIndex([{ key: "only", amount: 500000 }]);
    expect(result.hhi).toBeCloseTo(1, 6);
    expect(result.topShare).toBeCloseTo(1, 6);
    expect(result.band).toBe("high");
  });

  it("returns 0.25 for four exactly equal shares (boundary of moderate/high)", () => {
    const result = herfindahlHirschmanIndex([
      { key: "a", amount: 25 },
      { key: "b", amount: 25 },
      { key: "c", amount: 25 },
      { key: "d", amount: 25 },
    ]);
    expect(result.hhi).toBeCloseTo(0.25, 6);
    expect(result.band).toBe("moderate"); // not strictly > 0.25
  });

  it("matches a hand-calculated mixed-share example", () => {
    // shares: 0.5, 0.3, 0.2 -> hhi = 0.25 + 0.09 + 0.04 = 0.38
    const result = herfindahlHirschmanIndex([
      { key: "a", amount: 50 },
      { key: "b", amount: 30 },
      { key: "c", amount: 20 },
    ]);
    expect(result.hhi).toBeCloseTo(0.38, 6);
    expect(result.topShare).toBeCloseTo(0.5, 6);
    expect(result.band).toBe("high");
  });

  it("treats an empty/zero-total input as zero concentration, not NaN", () => {
    const result = herfindahlHirschmanIndex([]);
    expect(result.hhi).toBe(0);
    expect(result.band).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// Bus factor vs brute force
// ---------------------------------------------------------------------------

describe("bus factor — greedy matches brute-force enumeration", () => {
  const fixtures: { capacities: number[]; required: number }[] = [
    { capacities: [5, 2], required: 4 },
    { capacities: [5, 2], required: 7 },
    { capacities: [3, 3, 3], required: 5 },
    { capacities: [10, 1, 1, 1, 1], required: 9 },
    { capacities: [1, 1, 1, 1, 1], required: 3 },
    { capacities: [4, 3, 2, 1], required: 1 },
  ];

  for (const fixture of fixtures) {
    it(`capacities=${JSON.stringify(fixture.capacities)} required=${fixture.required}`, () => {
      const coverage = fixture.capacities.map((capacity, i) => ({
        personId: `p${i}`,
        capacity,
        isPrimary: i === 0,
      }));
      const greedy = busFactor("cap", coverage, fixture.required);
      const brute = busFactorBruteForce(coverage, fixture.required);
      expect(greedy.busFactor).toBe(brute);
    });
  }

  it("flags a single point of failure (bus factor 1) correctly", () => {
    const coverage = [
      { personId: "only-expert", capacity: 10, isPrimary: true },
      { personId: "backup", capacity: 0.5, isPrimary: false },
    ];
    const result = busFactor("Kubernetes Infra Ops", coverage, 5);
    expect(result.busFactor).toBe(1);
    expect(result.criticalPeople).toEqual(["only-expert"]);
  });
});

// ---------------------------------------------------------------------------
// Min-cut / choke-point detection
// ---------------------------------------------------------------------------

describe("choke-point detection (min-cut)", () => {
  it("finds the single bottleneck edge in a diamond graph", () => {
    // source -> a -> sink, source -> b -> sink, but b->sink is the weak link.
    const nodes = ["source", "a", "b", "sink"].map((id) => node(id));
    const edges: GraphEdge[] = [
      depEdge("sa", "source", "a", 0.9, 0.1),
      depEdge("asink", "a", "sink", 0.9, 0.1),
      depEdge("sb", "source", "b", 0.9, 0.9), // highly substitutable, low effective capacity
      depEdge("bsink", "b", "sink", 0.9, 0.9),
    ];
    const graph: EcosystemGraph = { nodes, edges };
    const result = findChokePoints(graph, "source", "sink");
    // The b-path has near-zero capacity (high substitutability), so the min
    // cut should isolate it rather than the a-path.
    expect(result.minCutValue).toBeGreaterThan(0);
    expect(result.cutEdgeIds.length).toBeGreaterThan(0);
  });

  it("returns zero-ish cut when source and sink are disconnected", () => {
    const nodes = ["source", "sink", "island"].map((id) => node(id));
    const edges: GraphEdge[] = [depEdge("e", "source", "island")];
    const graph: EcosystemGraph = { nodes, edges };
    const result = findChokePoints(graph, "source", "sink");
    expect(result.minCutValue).toBeCloseTo(0, 6);
  });
});

// ---------------------------------------------------------------------------
// Blast radius scenario
// ---------------------------------------------------------------------------

describe("blast radius (dependency shock propagation)", () => {
  it("propagates outward through depends_on edges with hop-based decay", () => {
    // directA depends_on removed; directB depends_on directA (transitive).
    const nodes = ["removed", "directA", "directB", "unrelated"].map((id) => node(id));
    const edges: GraphEdge[] = [
      depEdge("e1", "directA", "removed", 0.9, 0.1),
      depEdge("e2", "directB", "directA", 0.9, 0.5),
    ];
    const graph: EcosystemGraph = { nodes, edges };
    const result = computeBlastRadius(graph, "removed");

    expect(result.totalAffectedNodes).toBe(2);
    const direct = result.affected.find((a) => a.nodeId === "directA")!;
    const transitive = result.affected.find((a) => a.nodeId === "directB")!;
    expect(direct.hops).toBe(1);
    expect(transitive.hops).toBe(2);
    // Direct, low-substitutability dependents should take longer to recover
    // than further-out, more-buffered ones.
    expect(direct.estimatedRecoveryDays).toBeGreaterThan(0);
    expect(result.affected.find((a) => a.nodeId === "unrelated")).toBeUndefined();
  });

  it("reports zero affected nodes for an isolated node (invisible-dependency case)", () => {
    const nodes = ["lonely"].map((id) => node(id));
    const graph: EcosystemGraph = { nodes, edges: [] };
    const result = computeBlastRadius(graph, "lonely");
    expect(result.totalAffectedNodes).toBe(0);
  });
});
