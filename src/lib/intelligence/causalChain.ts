// src/lib/intelligence/causalChain.ts
//
// Renders the causal chain of an intervention: the ordered sequence of
// nodes an effect propagates through from an intervened variable to an
// outcome, with per-edge effect multipliers. Used by scenarioEngine.ts to
// show *why* a what-if answer is what it is, not just the final number.
import { CausalGraph, directedPaths } from "./causal";

export interface CausalChainStep {
  nodeId: string;
  label: string;
  /** cumulative multiplicative effect applied up to and including this node */
  cumulativeMultiplier: number;
  sign: "positive" | "negative" | "ambiguous";
}

export interface CausalChain {
  treatment: string;
  outcome: string;
  /** all simple directed paths found, longest/most-direct first */
  paths: CausalChainStep[][];
  /** the primary (shortest) path, used for the headline explanation */
  primaryPath: CausalChainStep[];
  identifiable: boolean;
  note: string;
}

/** Edge effect multipliers used to propagate a unit change along a path.
 * These are declared assumptions (documented in docs/INTELLIGENCE.md §4),
 * not fitted — scenarioEngine.ts additionally runs Monte Carlo over ranges
 * so the UI never claims false precision from these point multipliers. */
export const EDGE_MULTIPLIERS: Record<string, number> = {
  "headcount->pipelineGenerated": 1.8,
  "pipelineGenerated->revenue": 0.24,
  "price->winRate": -0.6,
  "winRate->revenue": 1.1,
  "dealCycleLength->revenue": -0.015,
};

export function buildCausalChain(graph: CausalGraph, treatment: string, outcome: string): CausalChain {
  const paths = directedPaths(graph, treatment, outcome);
  const nodeLabel = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;

  const toSteps = (path: string[]): CausalChainStep[] => {
    let cumulative = 1;
    return path.map((nodeId, idx) => {
      if (idx > 0) {
        const edgeKey = `${path[idx - 1]}->${nodeId}`;
        const multiplier = EDGE_MULTIPLIERS[edgeKey] ?? 0;
        cumulative *= multiplier === 0 ? 1 : multiplier;
      }
      const edge = graph.edges.find((e) => e.to === nodeId && path[idx - 1] === e.from);
      return {
        nodeId,
        label: nodeLabel(nodeId),
        cumulativeMultiplier: cumulative,
        sign: edge?.sign ?? "ambiguous",
      };
    });
  };

  const stepPaths = paths.map(toSteps).sort((a, b) => a.length - b.length);
  const primaryPath = stepPaths[0] ?? [];

  return {
    treatment,
    outcome,
    paths: stepPaths,
    primaryPath,
    identifiable: stepPaths.length > 0,
    note:
      stepPaths.length > 0
        ? `${stepPaths.length} causal path(s) found from "${nodeLabel(treatment)}" to "${nodeLabel(outcome)}" using declared edge multipliers (see docs/INTELLIGENCE.md §4).`
        : `No directed path exists from "${nodeLabel(treatment)}" to "${nodeLabel(outcome)}" in the causal graph; any observed relationship would be association only.`,
  };
}
