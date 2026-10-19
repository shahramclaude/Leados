// src/lib/executionEngine.ts
//
// BOOTSTRAP NOTE: no prior executionEngine.ts existed. Consumes the
// pre-computed observable map (see financeEngine.ts note) rather than
// recomputing delivery/tech-debt signals from raw events.

import type { NodeMarginal, ObservableNodeId } from "./types";
import { clamp01 } from "./temporal";

export interface ExecutionIntelligence {
  deliveryConfidencePressure: number;
  techDebtPressure: number;
  executionRiskAdjusted: number;
}

export function analyzeExecution(
  observables: Record<ObservableNodeId, number>,
  executionRiskBelief: NodeMarginal,
): ExecutionIntelligence {
  const deliveryConfidencePressure = observables.deliveryConfidenceDrop;
  const techDebtPressure = observables.techDebtVelocity;
  const executionRiskAdjusted = clamp01(
    ((deliveryConfidencePressure + techDebtPressure) / 2) * (0.5 + executionRiskBelief.p),
  );
  return { deliveryConfidencePressure, techDebtPressure, executionRiskAdjusted };
}
