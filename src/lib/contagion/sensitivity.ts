// Parameter-sensitivity reporting for contagion runs. Required on every
// contagion output (Measure gate #2): perturb each tunable parameter by a
// fixed delta (holding the seed and all other parameters fixed) and report
// how much the mean exposure score moves. This is what powers the
// "parameter-sensitivity sliders" in the Contagion Map UI and lets reviewers
// see how fragile/robust a headline exposure number is.

import { runCascadeSimulation, type CascadeGraph, type CascadeParams } from "./cascade";

export interface SensitivityEntry {
  parameter: keyof CascadeParams;
  baseValue: number;
  perturbedValue: number;
  delta: number; // perturbedValue - baseValue
  exposureDelta: number; // change in meanExposure caused by the perturbation
}

const PERTURBATION_FRACTION = 0.1; // +/-10%

export function computeSensitivityReport(
  graph: CascadeGraph,
  seedNodeIds: string[],
  params: CascadeParams,
  seed: number,
  baselineMeanExposure: number,
): SensitivityEntry[] {
  const entries: SensitivityEntry[] = [];
  const tunable: Array<keyof CascadeParams> = ["baseProbabilityMultiplier", "correlatedShockFactor"];

  for (const key of tunable) {
    const baseValue = params[key];
    const perturbedValue = Math.max(0, baseValue * (1 + PERTURBATION_FRACTION));
    const perturbedParams: CascadeParams = { ...params, [key]: perturbedValue };
    const result = runCascadeSimulation(graph, seedNodeIds, perturbedParams, seed);
    entries.push({
      parameter: key,
      baseValue,
      perturbedValue,
      delta: perturbedValue - baseValue,
      exposureDelta: result.meanExposure - baselineMeanExposure,
    });
  }

  return entries;
}
