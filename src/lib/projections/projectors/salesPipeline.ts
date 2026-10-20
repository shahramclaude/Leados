// Projector: salesPipeline — heterogeneous: deals (entityId=dealId) and
// customer health scores (entityId=customerId).
// Consumes: sales.deal_created, sales.deal_stage_changed, sales.customer_health_scored.
import type { Projector } from "../engine";

export type SalesPipelineState =
  | { kind: "unknown" }
  | {
      kind: "deal";
      dealId: string;
      customerId: string;
      stage: string;
      amountUsd: number;
      stageChanges: number;
    }
  | { kind: "customer"; customerId: string; healthScore: number; driver: string };

const initial: SalesPipelineState = { kind: "unknown" };

export const salesPipelineProjector: Projector<SalesPipelineState> = {
  name: "salesPipeline",
  interestedIn: ["sales.deal_created", "sales.deal_stage_changed", "sales.customer_health_scored"],
  initial,
  apply(state, e) {
    switch (e.type) {
      case "sales.deal_created": {
        const p = e.payload as { dealId: string; customerId: string; stage: string; amountUsd: number };
        return {
          kind: "deal",
          dealId: p.dealId,
          customerId: p.customerId,
          stage: p.stage,
          amountUsd: p.amountUsd,
          stageChanges: 0,
        };
      }
      case "sales.deal_stage_changed": {
        if (state.kind !== "deal") return state;
        const p = e.payload as { toStage: string };
        return { ...state, stage: p.toStage, stageChanges: state.stageChanges + 1 };
      }
      case "sales.customer_health_scored": {
        const p = e.payload as { customerId: string; healthScore: number; driver: string };
        return { kind: "customer", customerId: p.customerId, healthScore: p.healthScore, driver: p.driver };
      }
      default:
        return state;
    }
  },
};
