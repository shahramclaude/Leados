/**
 * The single entry point the rest of the app (API routes, UI, Part 06's
 * simulator, Part 10's strategy views) should use to ask a causal question.
 * It enforces "identification before estimation": identification always
 * runs first, and the result shape (`CausalEstimate`) makes it structurally
 * impossible to carry an `estimate.ate` without `identifiable: true`, or to
 * omit the sensitivity/assumptions fields.
 */

import { loadModel } from "./dag";
import { identify } from "./identification";
import {
  associationOnly,
  doublyRobustEstimate,
  frontdoorEstimate,
  ipwEstimate,
  MINIMUM_N,
  regressionAdjustmentEstimate,
  sensitivityForEstimate,
} from "./estimation";
import type { Row } from "./estimation";
import type { CausalEstimate, CausalQuery, EvidenceRef, StructuralCausalModel } from "./types";

const REVALIDATION_DAYS = 90;

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export interface RunQueryOptions {
  scm: StructuralCausalModel;
  query: CausalQuery;
  data: Row[];
  evidence: EvidenceRef[];
  asOf?: string;
  preferDoublyRobust?: boolean;
}

export function runCausalQuery(opts: RunQueryOptions): CausalEstimate {
  const { scm, query, data, evidence } = opts;
  const asOf = opts.asOf ?? new Date().toISOString();
  const graph = loadModel(scm); // throws loudly on a cyclic model

  const idResult = identify(scm, graph, query);
  const n = data.length;

  const base: Pick<
    CausalEstimate,
    "query" | "identifiable" | "assumptions" | "adjustmentSet" | "confoundersSuspected" | "evidence" | "sampleSize" | "asOf" | "revalidateBy"
  > = {
    query,
    identifiable: idResult.identifiable,
    assumptions: idResult.assumptions,
    adjustmentSet: idResult.adjustmentSet,
    confoundersSuspected: idResult.confoundersSuspected,
    evidence,
    sampleSize: n,
    asOf,
    revalidateBy: addDays(asOf, REVALIDATION_DAYS),
  };

  if (!idResult.identifiable) {
    const assoc = associationOnly(data, query.effect, query.on);
    const sensitivity = sensitivityForEstimate(
      assoc.r * stdOf(data, query.on),
      data.map((r) => r[query.on]),
      assoc.ci[0] * stdOf(data, query.on)
    );
    return {
      ...base,
      assumptions: [
        ...idResult.assumptions,
        "Not identified: reported as an association, not an effect. Do not read as causal.",
      ],
      associationOnly: assoc,
      sensitivity,
      minimumN: 0,
      estimate: undefined,
    };
  }

  if (idResult.method === "frontdoor") {
    if (n < MINIMUM_N.frontdoor) {
      const assoc = associationOnly(data, query.effect, query.on);
      return {
        ...base,
        assumptions: [
          ...idResult.assumptions,
          `Sample size (n=${n}) is below the minimum for frontdoor estimation (n>=${MINIMUM_N.frontdoor}); reporting association only until more data accrues.`,
        ],
        associationOnly: assoc,
        minimumN: MINIMUM_N.frontdoor,
        estimate: undefined,
      };
    }
    if (idResult.adjustmentSet.length !== 1) {
      // Frontdoor estimation is implemented for a single mediator. A
      // multi-mediator set IS identifiable in principle, but silently
      // picking one mediator and dropping the rest would produce a wrong
      // number under a confident-looking label. Honesty rule: degrade to
      // association-only rather than guess.
      const assoc = associationOnly(data, query.effect, query.on);
      return {
        ...base,
        assumptions: [
          ...idResult.assumptions,
          `Frontdoor-identified via multiple mediators [${idResult.adjustmentSet.join(", ")}]; multi-mediator frontdoor estimation is not yet implemented, so this is reported as association only rather than an unreliable point estimate.`,
        ],
        associationOnly: assoc,
        minimumN: MINIMUM_N.frontdoor,
        estimate: undefined,
      };
    }
    const mediator = idResult.adjustmentSet[0];
    const estimate = frontdoorEstimate(data, query.effect, mediator, query.on);
    const outcomeValues = data.map((r) => r[query.on]);
    const sensitivity = sensitivityForEstimate(estimate.ate, outcomeValues, closerToNull(estimate.ci));
    return {
      ...base,
      estimate: { ate: estimate.ate, ci: estimate.ci, method: "frontdoor" },
      minimumN: MINIMUM_N.frontdoor,
      sensitivity,
    };
  }

  if (n < MINIMUM_N.regression) {
    // Too little data for any adjusted estimator to be trustworthy: degrade
    // to association-only even though the query IS identifiable in
    // principle. The DAG-based assumptions are preserved so a re-run with
    // more data can promote this back to a causal estimate.
    const assoc = associationOnly(data, query.effect, query.on);
    return {
      ...base,
      assumptions: [
        ...idResult.assumptions,
        `Sample size (n=${n}) is below the minimum for adjusted estimation (n>=${MINIMUM_N.regression}); reporting association only until more data accrues.`,
      ],
      associationOnly: assoc,
      minimumN: MINIMUM_N.regression,
      estimate: undefined,
    };
  }

  // IPW / AIPW as implemented here model a BINARY treatment propensity
  // score; for a continuous/count treatment there is no 0/1 split to form
  // weights from, so we deliberately fall back to regression adjustment
  // (still a valid backdoor-adjusted estimator for continuous treatments
  // under the linear-SCM assumption already stated in `assumptions`).
  const treatmentDomain = scm.variables.find((v) => v.id === query.effect)?.domain;
  const treatmentIsBinary = treatmentDomain === "binary";

  let method: "regression" | "ipw" | "doubly-robust" = "regression";
  if (treatmentIsBinary && n >= MINIMUM_N["doubly-robust"] && (opts.preferDoublyRobust ?? true)) {
    method = "doubly-robust";
  } else if (treatmentIsBinary && n >= MINIMUM_N.ipw) {
    method = "ipw";
  }

  const estimate =
    method === "doubly-robust"
      ? doublyRobustEstimate(data, query.effect, query.on, idResult.adjustmentSet, { crossFit: true })
      : method === "ipw"
        ? ipwEstimate(data, query.effect, query.on, idResult.adjustmentSet)
        : regressionAdjustmentEstimate(data, query.effect, query.on, idResult.adjustmentSet);

  const outcomeValues = data.map((r) => r[query.on]);
  const sensitivity = sensitivityForEstimate(estimate.ate, outcomeValues, closerToNull(estimate.ci));

  return {
    ...base,
    estimate: { ate: estimate.ate, ci: estimate.ci, method: estimate.method },
    minimumN: method === "doubly-robust" ? MINIMUM_N["doubly-robust"] : method === "ipw" ? MINIMUM_N.ipw : MINIMUM_N.regression,
    sensitivity,
  };
}

function closerToNull(ci: [number, number]): number {
  return Math.abs(ci[0]) < Math.abs(ci[1]) ? ci[0] : ci[1];
}

function stdOf(data: Row[], col: string): number {
  const vals = data.map((r) => r[col]);
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, vals.length - 1);
  return Math.sqrt(variance) || 1;
}
