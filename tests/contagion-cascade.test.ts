import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  runCascadeSimulation,
  runSingleTrial,
  type CascadeGraph,
  type CascadeParams,
} from "@/lib/contagion/cascade";
import { computeSensitivityReport } from "@/lib/contagion/sensitivity";

function randomGraphArbitrary() {
  return fc
    .integer({ min: 3, max: 8 })
    .chain((n) => {
      const nodeIds = Array.from({ length: n }, (_, i) => `n${i}`);
      const edgeArb = fc.array(
        fc.record({
          fromIdx: fc.integer({ min: 0, max: n - 1 }),
          toIdx: fc.integer({ min: 0, max: n - 1 }),
          weight: fc.double({ min: 0, max: 1, noNaN: true }),
          group: fc.option(fc.constantFrom("g1", "g2"), { nil: null }),
        }),
        { minLength: 0, maxLength: 12 },
      );
      return edgeArb.map((rawEdges) => {
        const edges = rawEdges
          .filter((e) => e.fromIdx !== e.toIdx)
          .map((e, i) => ({
            id: `e${i}`,
            from: nodeIds[e.fromIdx],
            to: nodeIds[e.toIdx],
            weight: e.weight,
            correlatedShockGroup: e.group,
          }));
        const graph: CascadeGraph = {
          nodes: nodeIds.map((id) => ({ id, revenueWeight: 1 })),
          edges,
        };
        return graph;
      });
    });
}

describe("contagion cascade: reproducibility", () => {
  it("identical inputs (graph, seedNodeIds, params, seed) always produce identical output", () => {
    const graph: CascadeGraph = {
      nodes: [
        { id: "A", revenueWeight: 1 },
        { id: "B", revenueWeight: 1 },
        { id: "C", revenueWeight: 1 },
      ],
      edges: [
        { id: "e1", from: "A", to: "B", weight: 0.6 },
        { id: "e2", from: "B", to: "C", weight: 0.6 },
      ],
    };
    const params: CascadeParams = { baseProbabilityMultiplier: 1, correlatedShockFactor: 0.2, trials: 200 };

    const r1 = runCascadeSimulation(graph, ["A"], params, 7);
    const r2 = runCascadeSimulation(graph, ["A"], params, 7);

    expect(r1).toEqual(r2);
  });
});

describe("contagion cascade: monotonicity in edge/propagation probability (property test)", () => {
  it("increasing baseProbabilityMultiplier never shrinks the per-trial affected set (live-edge coupling)", () => {
    fc.assert(
      fc.property(
        randomGraphArbitrary(),
        fc.integer({ min: 0, max: 999 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (graph, seed, m1, extra) => {
          if (graph.nodes.length === 0) return true;
          const seedNode = graph.nodes[0].id;
          const m2 = m1 + extra; // m2 >= m1 by construction

          const paramsLow: CascadeParams = { baseProbabilityMultiplier: m1, correlatedShockFactor: 0.3, trials: 1 };
          const paramsHigh: CascadeParams = { baseProbabilityMultiplier: m2, correlatedShockFactor: 0.3, trials: 1 };

          for (let trial = 0; trial < 3; trial++) {
            const lowSet = runSingleTrial(graph, [seedNode], paramsLow, seed, trial);
            const highSet = runSingleTrial(graph, [seedNode], paramsHigh, seed, trial);
            for (const node of lowSet) {
              if (!highSet.has(node)) return false; // violates monotonicity => fail
            }
          }
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });

  it("increasing correlatedShockFactor never shrinks the per-trial affected set", () => {
    fc.assert(
      fc.property(
        randomGraphArbitrary(),
        fc.integer({ min: 0, max: 999 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (graph, seed, f1, extra) => {
          if (graph.nodes.length === 0) return true;
          const seedNode = graph.nodes[0].id;
          const f2 = Math.min(1, f1 + extra);

          const paramsLow: CascadeParams = { baseProbabilityMultiplier: 0.6, correlatedShockFactor: f1, trials: 1 };
          const paramsHigh: CascadeParams = { baseProbabilityMultiplier: 0.6, correlatedShockFactor: f2, trials: 1 };

          for (let trial = 0; trial < 3; trial++) {
            const lowSet = runSingleTrial(graph, [seedNode], paramsLow, seed, trial);
            const highSet = runSingleTrial(graph, [seedNode], paramsHigh, seed, trial);
            for (const node of lowSet) {
              if (!highSet.has(node)) return false;
            }
          }
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });

  it("aggregate mean exposure is monotone non-decreasing in baseProbabilityMultiplier on a fixed graph", () => {
    const graph: CascadeGraph = {
      nodes: [
        { id: "A", revenueWeight: 1 },
        { id: "B", revenueWeight: 1 },
        { id: "C", revenueWeight: 1 },
        { id: "D", revenueWeight: 1 },
      ],
      edges: [
        { id: "e1", from: "A", to: "B", weight: 0.5 },
        { id: "e2", from: "B", to: "C", weight: 0.5 },
        { id: "e3", from: "C", to: "D", weight: 0.5 },
      ],
    };
    const multipliers = [0, 0.25, 0.5, 0.75, 1, 1.5, 2];
    const exposures = multipliers.map(
      (m) =>
        runCascadeSimulation(graph, ["A"], { baseProbabilityMultiplier: m, correlatedShockFactor: 0, trials: 400 }, 11)
          .meanExposure,
    );
    for (let i = 1; i < exposures.length; i++) {
      expect(exposures[i]).toBeGreaterThanOrEqual(exposures[i - 1] - 1e-9);
    }
  });
});

describe("contagion cascade: sensitivity reporting", () => {
  it("every run can produce a sensitivity report with both tunable parameters", () => {
    const graph: CascadeGraph = {
      nodes: [
        { id: "A", revenueWeight: 1 },
        { id: "B", revenueWeight: 2 },
      ],
      edges: [{ id: "e1", from: "A", to: "B", weight: 0.5, correlatedShockGroup: "g1" }],
    };
    const params: CascadeParams = { baseProbabilityMultiplier: 0.8, correlatedShockFactor: 0.3, trials: 300 };
    const base = runCascadeSimulation(graph, ["A"], params, 5);
    const sensitivity = computeSensitivityReport(graph, ["A"], params, 5, base.meanExposure);

    expect(sensitivity).toHaveLength(2);
    expect(sensitivity.map((s) => s.parameter).sort()).toEqual(["baseProbabilityMultiplier", "correlatedShockFactor"]);
    for (const entry of sensitivity) {
      expect(entry.delta).toBeGreaterThan(0); // +10% perturbation
      expect(typeof entry.exposureDelta).toBe("number");
    }
  });
});

describe("contagion cascade: planted-cascade recovery on a seeded network", () => {
  it("recovers expected propagation along a planted line graph and correctly isolates a disconnected node", () => {
    // Planted chain: A(seed) -> B -> C -> D, each edge weight 0.95, independent draws.
    // Analytic expectation (live-edge / independent-cascade equivalence):
    //   P(B affected) = 0.95
    //   P(C affected) = 0.95 * 0.95 = 0.9025
    //   P(D affected) = 0.95^3 = 0.857375
    // Disconnected node E must NEVER be affected (no path from A).
    const graph: CascadeGraph = {
      nodes: [
        { id: "A", revenueWeight: 1 },
        { id: "B", revenueWeight: 1 },
        { id: "C", revenueWeight: 1 },
        { id: "D", revenueWeight: 1 },
        { id: "E", revenueWeight: 1 },
      ],
      edges: [
        { id: "e1", from: "A", to: "B", weight: 0.95 },
        { id: "e2", from: "B", to: "C", weight: 0.95 },
        { id: "e3", from: "C", to: "D", weight: 0.95 },
      ],
    };
    const params: CascadeParams = { baseProbabilityMultiplier: 1, correlatedShockFactor: 0, trials: 4000 };
    const result = runCascadeSimulation(graph, ["A"], params, 123);

    const accuracyTable = [
      { node: "B", expected: 0.95, actual: result.affectedFrequency["B"] },
      { node: "C", expected: 0.9025, actual: result.affectedFrequency["C"] },
      { node: "D", expected: 0.857375, actual: result.affectedFrequency["D"] },
      { node: "E", expected: 0, actual: result.affectedFrequency["E"] },
    ];
    console.table(accuracyTable);

    for (const row of accuracyTable) {
      expect(Math.abs(row.actual - row.expected)).toBeLessThan(0.05);
    }
    expect(result.affectedFrequency["E"]).toBe(0);
  });
});
