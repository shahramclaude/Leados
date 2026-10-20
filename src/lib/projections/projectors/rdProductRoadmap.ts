// Projector: rdProductRoadmap — heterogeneous: features (entityId=featureId),
// experiments (entityId=experimentId), roadmap items (entityId=itemId).
// Consumes: rd_product.feature_proposed, rd_product.experiment_result_logged,
//           rd_product.roadmap_item_scheduled.
import type { Projector } from "../engine";

export type RdProductRoadmapState =
  | { kind: "unknown" }
  | { kind: "feature"; featureId: string; title: string; proposedBy: string }
  | {
      kind: "experiment";
      experimentId: string;
      featureId: string;
      outcome: "positive" | "neutral" | "negative";
      metricDelta: number;
    }
  | { kind: "roadmap_item"; itemId: string; quarter: string; confidence: number };

const initial: RdProductRoadmapState = { kind: "unknown" };

export const rdProductRoadmapProjector: Projector<RdProductRoadmapState> = {
  name: "rdProductRoadmap",
  interestedIn: [
    "rd_product.feature_proposed",
    "rd_product.experiment_result_logged",
    "rd_product.roadmap_item_scheduled",
  ],
  initial,
  apply(_state, e) {
    switch (e.type) {
      case "rd_product.feature_proposed": {
        const p = e.payload as { featureId: string; title: string; proposedBy: string };
        return { kind: "feature", featureId: p.featureId, title: p.title, proposedBy: p.proposedBy };
      }
      case "rd_product.experiment_result_logged": {
        const p = e.payload as {
          experimentId: string;
          featureId: string;
          outcome: "positive" | "neutral" | "negative";
          metricDelta: number;
        };
        return {
          kind: "experiment",
          experimentId: p.experimentId,
          featureId: p.featureId,
          outcome: p.outcome,
          metricDelta: p.metricDelta,
        };
      }
      case "rd_product.roadmap_item_scheduled": {
        const p = e.payload as { itemId: string; quarter: string; confidence: number };
        return { kind: "roadmap_item", itemId: p.itemId, quarter: p.quarter, confidence: p.confidence };
      }
      default:
        return _state;
    }
  },
};
