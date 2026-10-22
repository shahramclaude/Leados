/**
 * src/lib/causal/hypothesis.ts
 * Single-claim construction: takes a raw estimator result + identification
 * metadata + diagnostics and produces a fully-formed, language-policy
 * compliant `CausalClaim`. This is the ONLY place a `CausalClaim` should be
 * assembled — every causal surface in the product must go through here so
 * class resolution and narrative generation stay centralized.
 */
import type { CausalGraph, CausalClaim, Estimand, EstimatorMethod, Diagnostics } from "./types";
import type { Explain } from "../belief/explain";
import { checkBackdoorCriterion } from "./graph";
import { resolveClaimClass, generateNarrative, lintNarrative } from "./languagePolicy";

export interface ClaimBlueprint {
  id: string;
  treatment: string;
  outcome: string;
  estimand: Estimand;
  method: EstimatorMethod;
  unit: string;
  strategy: string;
  assumptions: string[];
  adjustmentSet: string[];
  /** Supply a graph to run an explicit backdoor check; omit only for designs (IV/RDD/SCM) that identify effects without backdoor adjustment. */
  graph?: CausalGraph;
  /** If no graph is supplied, identification validity must be asserted explicitly with a reason (e.g. "instrument exogeneity assumed, not graph-checked"). */
  identificationValidWithoutGraph?: { valid: boolean; reason: string };
  rawEstimate: Explain<number>;
  diagnostics: Diagnostics;
}

export interface BuiltClaim {
  claim: CausalClaim;
  identificationCheck: {
    ranBackdoorCheck: boolean;
    valid: boolean;
    reasons: string[];
  };
}

export function buildCausalClaim(bp: ClaimBlueprint): BuiltClaim {
  let identificationValid = true;
  let identificationReasons: string[] = [];
  let ranBackdoorCheck = false;

  if (bp.graph) {
    ranBackdoorCheck = true;
    const result = checkBackdoorCriterion(bp.graph, bp.treatment, bp.outcome, bp.adjustmentSet);
    identificationValid = result.valid;
    identificationReasons = result.reasons;
  } else if (bp.identificationValidWithoutGraph) {
    identificationValid = bp.identificationValidWithoutGraph.valid;
    identificationReasons = [bp.identificationValidWithoutGraph.reason];
  } else {
    // Honesty rule: no graph AND no explicit identification argument = cannot certify identification.
    identificationValid = false;
    identificationReasons = ["No identification strategy was supplied (no backdoor graph and no explicit argument) — refusing to label this causal."];
  }

  const diagnosticFlags: { label: string; ok: boolean }[] = [];
  if (bp.diagnostics.parallelTrendsP != null) {
    diagnosticFlags.push({ label: "parallel trends (pre-period)", ok: bp.diagnostics.parallelTrendsP > 0.1 });
  }
  if (bp.diagnostics.rmspeRatio != null) {
    diagnosticFlags.push({ label: "synthetic-control RMSPE ratio < 0.25", ok: bp.diagnostics.rmspeRatio < 0.25 });
  }
  if (bp.diagnostics.firstStageF != null) {
    diagnosticFlags.push({ label: "instrument strength (first-stage F >= 10)", ok: bp.diagnostics.firstStageF >= 10 });
  }
  if (bp.diagnostics.balanceStats.length > 0) {
    diagnosticFlags.push({ label: "covariate balance (SMD < 0.1 after weighting)", ok: bp.diagnostics.balanceStats.every((b) => b.balanced) });
  }

  // Convention used throughout this module: diagnostics.placeboP is a p-value-LIKE
  // quantity where LOW (<= 0.1) means the real treatment is distinguishable from
  // placebo/fake-treatment noise (supports the claim); HIGH means it is not.
  const placeboPassed = bp.diagnostics.placeboP == null ? null : bp.diagnostics.placeboP <= 0.1;

  const { claimClass, downgradeReasons } = resolveClaimClass({
    identificationValid,
    placeboPassed,
    diagnosticFlags,
  });

  const narrative = generateNarrative({ treatment: bp.treatment, outcome: bp.outcome, class: claimClass, estimate: bp.rawEstimate, unit: bp.unit });
  const lintViolations = lintNarrative(narrative, claimClass);
  if (lintViolations.length > 0) {
    // This should never happen because generateNarrative is the compliant generator,
    // but we fail loudly rather than silently ship non-compliant language.
    throw new Error(`Generated narrative failed causal:lint for claim ${bp.id}: ${lintViolations.map((v) => v.reason).join("; ")}`);
  }

  const claim: CausalClaim = {
    id: bp.id,
    treatment: bp.treatment,
    outcome: bp.outcome,
    estimand: bp.estimand,
    method: bp.method,
    identification: { strategy: bp.strategy, assumptions: bp.assumptions, adjustmentSet: bp.adjustmentSet },
    estimate: bp.rawEstimate,
    diagnostics: { ...bp.diagnostics, backdoorValid: ranBackdoorCheck ? identificationValid : undefined, backdoorViolations: identificationReasons },
    class: claimClass,
    narrative,
    unit: bp.unit,
  };

  return {
    claim,
    identificationCheck: { ranBackdoorCheck, valid: identificationValid, reasons: [...identificationReasons, ...downgradeReasons] },
  };
}
