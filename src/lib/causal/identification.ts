/**
 * Identification: decide WHETHER a causal query P(Y | do(X)) is answerable
 * from observational data before any number is estimated. This module never
 * computes an effect; it only decides identifiability and the adjustment
 * set, per the Part 05 standing order ("identification before estimation").
 */

import {
  ancestors,
  backdoorAdjustmentSet,
  frontdoorAdjustment,
  type Graph,
} from "./dag";
import type { CausalQuery, StructuralCausalModel } from "./types";

export type IdentificationMethod = "backdoor" | "frontdoor" | "none";

export interface IdentificationResult {
  identifiable: boolean;
  method: IdentificationMethod;
  adjustmentSet: string[];
  assumptions: string[];
  confoundersSuspected: string[];
  reason?: string;
}

export function identify(
  scm: StructuralCausalModel,
  graph: Graph,
  query: CausalQuery
): IdentificationResult {
  const { effect: x, on: y } = query;

  if (!graph.nodes.includes(x) || !graph.nodes.includes(y)) {
    throw new Error(
      `Cannot identify query: unknown variable(s) in {effect: "${x}", on: "${y}"}`
    );
  }

  const backdoor = backdoorAdjustmentSet(graph, x, y);
  if (backdoor.satisfied) {
    return {
      identifiable: true,
      method: "backdoor",
      adjustmentSet: backdoor.adjustmentSet,
      assumptions: [
        backdoor.adjustmentSet.length > 0
          ? `No unmeasured confounding given adjustment set [${backdoor.adjustmentSet.join(", ")}] (backdoor criterion).`
          : "No unmeasured confounding: no backdoor paths exist between treatment and outcome in this DAG.",
        "Correct model specification (the structural assignments reflect reality; violated functional-form assumptions bias the estimate).",
        "SUTVA: one unit's treatment does not affect another unit's outcome.",
        "Positivity: every covariate stratum has a non-degenerate chance of receiving each treatment level.",
      ],
      confoundersSuspected: [],
    };
  }

  const frontdoor = frontdoorAdjustment(graph, x, y);
  if (frontdoor.satisfied) {
    return {
      identifiable: true,
      method: "frontdoor",
      adjustmentSet: frontdoor.mediators,
      assumptions: [
        `Full mediation through [${frontdoor.mediators.join(", ")}]: these variables intercept every directed path from treatment to outcome.`,
        "No unmeasured confounding between treatment and the mediator set.",
        "Any treatment-outcome confounding is blocked by conditioning on treatment when estimating the mediator-outcome effect (frontdoor criterion).",
      ],
      confoundersSuspected: suspectedConfounders(graph, x, y),
    };
  }

  return {
    identifiable: false,
    method: "none",
    adjustmentSet: [],
    assumptions: [],
    confoundersSuspected: suspectedConfounders(graph, x, y),
    reason:
      backdoor.reason ??
      "No backdoor or frontdoor adjustment exists for this query given the current DAG and variable observability.",
  };
}

/** Latent (unobservable) variables that are ancestors of both X and Y — the classic hidden-confounder signature. */
function suspectedConfounders(graph: Graph, x: string, y: string): string[] {
  const ax = ancestors(graph, x);
  const ay = ancestors(graph, y);
  const shared = [...ax].filter((n) => ay.has(n));
  return shared.filter((n) => !graph.variableById.get(n)?.observable).sort();
}
