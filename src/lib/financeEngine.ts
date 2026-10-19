// src/lib/financeEngine.ts
//
// BOOTSTRAP NOTE: no prior financeEngine.ts existed. Consumes the
// pre-computed observable map from signalFusion (task spec: "signalFusion
// gets the observable map as pre-computed inputs rather than recomputing
// from raw events") instead of re-deriving budget/runway signals itself.

import type { NodeMarginal, ObservableNodeId } from "./types";
import { clamp01 } from "./temporal";

export interface FinanceIntelligence {
  runwayPressure: number;
  budgetDeviationPressure: number;
  financialRiskAdjusted: number;
}

export function analyzeFinance(
  observables: Record<ObservableNodeId, number>,
  financialRiskBelief: NodeMarginal,
): FinanceIntelligence {
  const runwayPressure = observables.runwayMonths;
  const budgetDeviationPressure = observables.budgetDeviationPct;
  // Belief-coupled adjustment, same (0.5 + p) multiplier convention used for
  // flightRisk in talentEngine.ts, applied here for consistency across the
  // fabric (DESIGN PARAMETER, original derivation — not separately
  // specified by the task for financialRisk, but the orchestrator wiring
  // described for flightRisk generalizes naturally here).
  const financialRiskAdjusted = clamp01(
    ((runwayPressure + budgetDeviationPressure) / 2) * (0.5 + financialRiskBelief.p),
  );
  return { runwayPressure, budgetDeviationPressure, financialRiskAdjusted };
}
