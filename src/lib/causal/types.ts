/**
 * Core types for the LEADOS structural causal model (SCM) layer.
 *
 * Design rule (HONESTY RULE #6 of the Part 05 standing order):
 *   An unidentifiable claim is labeled "association only" IN THE DATA MODEL
 *   ITSELF. `CausalEstimate.identifiable` is the single source of truth the
 *   rendering layer (`language.ts`) consults to choose verbs. There is no
 *   path for a UI component to say "causes" / "drives" without reading this
 *   field, and no path for copy to override it.
 */

import type { EvidenceRef } from "@/lib/explain";

export type { EvidenceRef } from "@/lib/explain";

export type VariableKind =
  | "metric" // a tracked KPI, e.g. retention, engagement score
  | "people-fact" // a fact about a person/role, e.g. tenure, compensation band
  | "execution-fact" // a fact about work execution, e.g. 1:1 frequency, team size
  | "latent" // unmeasured / unobservable, included for honesty about confounding
  | "outcome"; // the dependent variable of interest in most queries

export type VariableDomain = "continuous" | "binary" | "count" | "categorical";

export interface CausalVariable {
  id: string;
  label: string;
  kind: VariableKind;
  domain: VariableDomain;
  description: string;
  unit?: string;
  /** false => latent/unmeasured. Cannot appear in an adjustment set. */
  observable: boolean;
}

export type StructuralFunctionSpec =
  | { type: "linear"; coefficients: Record<string, number>; intercept: number }
  | { type: "logistic"; coefficients: Record<string, number>; intercept: number };

export type NoiseSpec =
  | { type: "normal"; mean: number; sd: number }
  | { type: "bernoulli"; p: number };

export interface StructuralAssignment {
  /** The variable this structural equation assigns: X := f(parents, noise) */
  variable: string;
  parents: string[];
  fn: StructuralFunctionSpec;
  noise: NoiseSpec;
}

export interface StructuralCausalModel {
  id: string;
  version: string;
  label: string;
  description: string;
  variables: CausalVariable[];
  assignments: StructuralAssignment[];
  createdAt: string;
  notes?: string;
}

export interface CausalQuery {
  effect: string; // treatment / intervention variable id
  on: string; // outcome variable id
  population: string; // population / cohort description
}

export type EstimateMethod = "ipw" | "doubly-robust" | "regression" | "frontdoor";

export interface PointEstimate {
  ate: number;
  ci: [number, number];
  method: EstimateMethod;
}

export interface AssociationOnly {
  r: number;
  ci: [number, number];
}

export interface SensitivityAnalysis {
  /**
   * E-value (VanderWeele & Ding, 2017, Annals of Internal Medicine,
   * "Sensitivity Analysis in Observational Research: Introducing the
   * E-Value"): the minimum strength of association, on the risk-ratio
   * scale, that an unmeasured confounder would need to have with both
   * treatment and outcome to fully explain away the observed
   * association/effect. Higher = more robust to hidden confounding.
   */
  eValue: number;
  eValueCi?: number;
  note: string;
}

export interface CausalEstimate {
  query: CausalQuery;
  identifiable: boolean;
  assumptions: string[];
  adjustmentSet: string[];
  estimate?: PointEstimate;
  associationOnly?: AssociationOnly;
  confoundersSuspected: string[];
  sensitivity?: SensitivityAnalysis;
  evidence: EvidenceRef[];
  /** Minimum sample size required for the estimate method actually used. */
  minimumN: number;
  sampleSize: number;
  /** When this estimate was computed. */
  asOf: string;
  /** When it should be recomputed / re-validated. */
  revalidateBy: string;
}

export interface FalsificationReport {
  claimId: string;
  placebo: {
    permutations: number;
    observedEffect: number;
    placeboMean: number;
    placeboSd: number;
    passed: boolean; // true => effect plausibly vanishes under placebo
    note: string;
  };
  negativeControl?: {
    controlOutcome: string;
    effectOnControl: number;
    ci: [number, number];
    passed: boolean; // true => no spurious effect detected on the control
    note: string;
  };
  crossFitted: boolean;
  generatedAt: string;
}

export type ClaimFreshness = "fresh" | "aging" | "expired";

export interface CausalClaim {
  id: string;
  scmId: string;
  label: string;
  estimate: CausalEstimate;
  falsification?: FalsificationReport;
  asOf: string;
  revalidateBy: string;
}
