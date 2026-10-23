// Post-change tracking + recalibration loop (Part 39 counterfactual-estimation
// lineage): the twin learns from each reorg by nudging its coefficients
// toward realized outcomes, with damping so a single data point cannot swing
// the model (avoids over-fitting to one reorg / one political narrative).

import type { StructuralMoveType } from "./types";
import type { TwinParams } from "./twinEngine";

export type RealizedOutcome = {
  type: StructuralMoveType;
  predictedCapacityChangePct: number;
  realizedCapacityChangePct: number;
  predictedCycleTimeChangeDays: number;
  realizedCycleTimeChangeDays: number;
};

export type Variance = {
  capacityErrorPct: number; // realized - predicted
  cycleTimeErrorDays: number;
  withinDeclaredError: boolean;
};

export function computeVariance(outcome: RealizedOutcome, params: TwinParams): Variance {
  const capacityErrorPct = outcome.realizedCapacityChangePct - outcome.predictedCapacityChangePct;
  const cycleTimeErrorDays = outcome.realizedCycleTimeChangeDays - outcome.predictedCycleTimeChangeDays;

  const capacityBand = Math.max(0.5, Math.abs(outcome.predictedCapacityChangePct) * params.capacityErrorFraction);
  const cycleBand = Math.max(0.3, Math.abs(outcome.predictedCycleTimeChangeDays) * params.cycleTimeErrorFraction);

  const withinDeclaredError = Math.abs(capacityErrorPct) <= capacityBand && Math.abs(cycleTimeErrorDays) <= cycleBand;

  return { capacityErrorPct, cycleTimeErrorDays, withinDeclaredError };
}

const DAMPING = 0.3; // only move 30% of the way toward the observed ratio per reorg

/**
 * Nudges the coefficient for the given move type toward the realized
 * outcome. Damped so the twin "learns" gradually rather than chasing noise
 * from a single reorg.
 */
export function recalibrateParams(params: TwinParams, outcome: RealizedOutcome): TwinParams {
  const next: TwinParams = structuredClone(params);

  const predictedCap = outcome.predictedCapacityChangePct;
  const realizedCap = outcome.realizedCapacityChangePct;
  if (Math.abs(predictedCap) > 0.01) {
    const ratio = realizedCap / predictedCap;
    const boundedRatio = Math.max(0.3, Math.min(3, ratio));
    const currentCoef = next.capacityCoefficients[outcome.type];
    next.capacityCoefficients[outcome.type] = currentCoef * (1 - DAMPING) + currentCoef * boundedRatio * DAMPING;
  }

  const predictedCycle = outcome.predictedCycleTimeChangeDays;
  const realizedCycle = outcome.realizedCycleTimeChangeDays;
  if (Math.abs(predictedCycle) > 0.01) {
    const ratio = realizedCycle / predictedCycle;
    const boundedRatio = Math.max(0.3, Math.min(3, ratio));
    const currentCoef = next.cycleTimeCoefficients[outcome.type];
    next.cycleTimeCoefficients[outcome.type] = currentCoef * (1 - DAMPING) + currentCoef * boundedRatio * DAMPING;
  }

  return next;
}
