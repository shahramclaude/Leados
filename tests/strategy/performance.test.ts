import { describe, expect, it } from "vitest";
import { generateSyntheticOrg } from "@/lib/strategy/seedDemo";
import {
  cascadeCompletenessFor,
  detectCapacityConflicts,
  detectCycles,
  detectOrphanObjectives,
  buildGraph,
  linkIntegrityFindings,
  strategyPath,
} from "@/lib/strategy/alignmentEngine";

// Phase 4 Gate 5: simulated 100-objective org, cascade queries < 100ms p95.
// We run each query class N times and report the p95 wall-clock latency.
function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return sorted[idx];
}

describe("100-objective org: cascade query performance", () => {
  const org = generateSyntheticOrg(100, 7);

  it("full alignment sweep (cycles + orphans + link integrity + capacity + cascade completeness) is fast", () => {
    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      const graph = buildGraph(org.objectives, org.links);
      detectCycles(graph, "contributes_to");
      detectOrphanObjectives(graph);
      linkIntegrityFindings(org.objectives, org.links);
      detectCapacityConflicts(org.initiatives, org.teams);
      for (const o of org.objectives) {
        cascadeCompletenessFor(o, org.keyResults, org.initiatives, org.evidence);
      }
      samples.push(performance.now() - start);
    }
    const latency = p95(samples);
    // eslint-disable-next-line no-console
    console.log(`[perf] full alignment sweep over 100 objectives: p95=${latency.toFixed(2)}ms (n=${samples.length})`);
    expect(latency).toBeLessThan(100);
  });

  it("single strategy-path query is fast", () => {
    const targetId = org.objectives[org.objectives.length - 1].id;
    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      const start = performance.now();
      strategyPath(targetId, org.objectives, org.links, org.keyResults, org.initiatives, org.teams, org.milestones, org.evidence);
      samples.push(performance.now() - start);
    }
    const latency = p95(samples);
    // eslint-disable-next-line no-console
    console.log(`[perf] strategy path query over 100 objectives: p95=${latency.toFixed(2)}ms (n=${samples.length})`);
    expect(latency).toBeLessThan(100);
  });

  it("produces a non-trivial graph (sanity check on the fixture itself)", () => {
    expect(org.objectives.length).toBe(100);
    expect(org.links.length).toBeGreaterThan(90);
    expect(org.initiatives.length).toBeGreaterThan(90);
  });
});
