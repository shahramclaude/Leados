import type { Explain } from "../core/explain";

export interface Strategy {
  id: string;
  name: string;
  description: Explain<string>;
  /** Per-tick parameter deltas representing this strategy's ongoing effect inside the twin. */
  twinDeltas: Record<string, number>;
}

export interface ScenarioWeight {
  scenarioId: string;
  weight: number;
}

export interface UtilityMetricWeights {
  revenueGrowth: number;
  cashRunwayMonths: number;
  churnRate: number; // negative-is-good metric, handled specially
  marketShare: number;
}

export const DEFAULT_UTILITY_WEIGHTS: UtilityMetricWeights = {
  revenueGrowth: 0.4,
  cashRunwayMonths: 0.25,
  churnRate: 0.15,
  marketShare: 0.2,
};
