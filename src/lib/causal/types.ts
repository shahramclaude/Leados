/**
 * src/lib/causal/types.ts
 * Shared types for the causal-inference layer, per the Phase 1 model spec.
 */
import type { Explain } from "../belief/explain";

export type VariableRole = "treatment" | "outcome" | "confounder" | "mediator" | "collider" | "instrument" | "covariate";

export interface Variable {
  id: string;
  label: string;
  role: VariableRole;
  description?: string;
}

export type EdgeKind = "causal" | "confounder" | "mediator" | "collider";

export interface CausalEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  /** Optional prior belief about effect strength/sign, used only for display, never for inference. */
  strengthPrior?: number;
}

export interface CausalGraph {
  nodes: Variable[];
  edges: CausalEdge[];
}

export type Estimand = "ATE" | "ATT" | "CATE";

export type EstimatorMethod =
  | "did"
  | "synthetic_control"
  | "psm_ipw"
  | "iv_2sls"
  | "rdd"
  | "uplift";

export type ClaimClass = "causal" | "suggestive" | "associational";

export interface Identification {
  strategy: string;
  assumptions: string[];
  adjustmentSet: string[];
}

export interface Diagnostics {
  placeboP: number | null;
  sensitivityBounds: {
    /** Smallest Gamma (Rosenbaum) or E-value at which the effect could be explained away. */
    type: "e-value" | "rosenbaum-gamma" | "none";
    value: number | null;
    interpretation: string;
  };
  balanceStats: {
    covariate: string;
    smdBefore: number;
    smdAfter: number;
    balanced: boolean;
  }[];
  parallelTrendsP?: number | null;
  rmspeRatio?: number | null;
  firstStageF?: number | null;
  backdoorValid?: boolean;
  backdoorViolations?: string[];
}

export interface CausalClaim {
  id: string;
  treatment: string;
  outcome: string;
  estimand: Estimand;
  method: EstimatorMethod;
  identification: Identification;
  estimate: Explain<number>;
  diagnostics: Diagnostics;
  class: ClaimClass;
  /** Short narrative generated under the language policy for the resolved `class`. */
  narrative: string;
  /** Human-readable unit of the estimate, e.g. "percentage points" or "$ / deal". */
  unit: string;
}
