/**
 * `npm run eval:causal` — synthetic SCM datasets with KNOWN ground-truth
 * effects. The harness must:
 *  (1) recover identifiable effects within declared error bounds, and
 *  (2) refuse (return non-identifiable / association-only) on a confounded
 *      synthetic case where the confounder is unobservable.
 *
 * Exits non-zero on any failure so it can gate `npm run verify`.
 */
import { loadSCM, simulate } from "../src/lib/causal/scm";
import { runCausalQuery } from "../src/lib/causal/query";
import { placeboTest } from "../src/lib/causal/validation";
import { mulberry32 } from "../src/lib/causal/rng";
import type { StructuralCausalModel } from "../src/lib/causal/types";

let failures = 0;

function check(label: string, condition: boolean, detail: string): void {
  const status = condition ? "PASS" : "FAIL";
  if (!condition) failures++;
  console.log(`[${status}] ${label} — ${detail}`);
}

// --- Scenario 1: fully-observed confounder, linear SCM -----------------
// Z -> X, Z -> Y, X -> Y. True ATE of X on Y is 2.0. Z is observed, so the
// backdoor criterion should find {Z} and recover ~2.0.
const scenario1: StructuralCausalModel = {
  id: "eval-observed-confounder",
  version: "1.0.0",
  label: "Observed confounder (Z -> X, Z -> Y, X -> Y)",
  description: "Ground truth ATE(X on Y) = 2.0",
  createdAt: new Date().toISOString(),
  variables: [
    { id: "Z", label: "Z", kind: "metric", domain: "continuous", description: "confounder", observable: true },
    { id: "X", label: "X", kind: "metric", domain: "continuous", description: "treatment", observable: true },
    { id: "Y", label: "Y", kind: "outcome", domain: "continuous", description: "outcome", observable: true },
  ],
  assignments: [
    { variable: "Z", parents: [], fn: { type: "linear", coefficients: {}, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
    { variable: "X", parents: ["Z"], fn: { type: "linear", coefficients: { Z: 1.5 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
    { variable: "Y", parents: ["X", "Z"], fn: { type: "linear", coefficients: { X: 2.0, Z: 1.0 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
  ],
};

// --- Scenario 2: hidden (latent) confounder -----------------------------
// U (latent) -> X, U -> Y, X -> Y. Must be refused: observable set cannot
// block the backdoor path X <- U -> Y.
const scenario2: StructuralCausalModel = {
  id: "eval-hidden-confounder",
  version: "1.0.0",
  label: "Hidden confounder (U latent -> X, U -> Y, X -> Y)",
  description: "Non-identifiable: U is unobservable.",
  createdAt: new Date().toISOString(),
  variables: [
    { id: "U", label: "U", kind: "latent", domain: "continuous", description: "hidden confounder", observable: false },
    { id: "X", label: "X", kind: "metric", domain: "continuous", description: "treatment", observable: true },
    { id: "Y", label: "Y", kind: "outcome", domain: "continuous", description: "outcome", observable: true },
  ],
  assignments: [
    { variable: "U", parents: [], fn: { type: "linear", coefficients: {}, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
    { variable: "X", parents: ["U"], fn: { type: "linear", coefficients: { U: 1.2 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
    { variable: "Y", parents: ["X", "U"], fn: { type: "linear", coefficients: { X: 0.1, U: 2.5 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
  ],
};

// --- Scenario 3: frontdoor-identifiable --------------------------------
// U (latent) -> X, U -> Y, X -> M -> Y. No direct X -> Y edge, so M
// intercepts every directed path. True ATE(X on Y) = effect(X->M) * effect(M->Y) = 1.5 * 2.0 = 3.0
const scenario3: StructuralCausalModel = {
  id: "eval-frontdoor",
  version: "1.0.0",
  label: "Frontdoor-identifiable (U latent -> X,Y; X -> M -> Y)",
  description: "Ground truth ATE(X on Y) = 1.5 * 2.0 = 3.0",
  createdAt: new Date().toISOString(),
  variables: [
    { id: "U", label: "U", kind: "latent", domain: "continuous", description: "hidden confounder", observable: false },
    { id: "X", label: "X", kind: "metric", domain: "continuous", description: "treatment", observable: true },
    { id: "M", label: "M", kind: "metric", domain: "continuous", description: "mediator", observable: true },
    { id: "Y", label: "Y", kind: "outcome", domain: "continuous", description: "outcome", observable: true },
  ],
  assignments: [
    { variable: "U", parents: [], fn: { type: "linear", coefficients: {}, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
    { variable: "X", parents: ["U"], fn: { type: "linear", coefficients: { U: 1.0 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
    { variable: "M", parents: ["X"], fn: { type: "linear", coefficients: { X: 1.5 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 0.5 } },
    { variable: "Y", parents: ["M", "U"], fn: { type: "linear", coefficients: { M: 2.0, U: 1.8 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
  ],
};

function run(): void {
  // Scenario 1
  {
    const model = loadSCM(scenario1);
    const data = simulate(model, 2000, mulberry32(1));
    const estimate = runCausalQuery({
      scm: scenario1,
      query: { effect: "X", on: "Y", population: "synthetic" },
      data,
      evidence: [],
    });
    check("scenario1: identifiable", estimate.identifiable === true, `identifiable=${estimate.identifiable}`);
    check(
      "scenario1: correct adjustment set",
      JSON.stringify(estimate.adjustmentSet) === JSON.stringify(["Z"]),
      `adjustmentSet=${JSON.stringify(estimate.adjustmentSet)}`
    );
    const ate = estimate.estimate?.ate ?? NaN;
    check(
      "scenario1: ATE recovered within +/-0.2 of ground truth 2.0",
      Math.abs(ate - 2.0) < 0.2,
      `estimated ATE=${ate.toFixed(3)} (method=${estimate.estimate?.method})`
    );

    const placebo = placeboTest(data, "X", "Y", estimate.adjustmentSet, ate, { permutations: 60 });
    check(
      "scenario1: placebo effect vanishes",
      Math.abs(placebo.placeboMean) < 0.2,
      `placeboMean=${placebo.placeboMean.toFixed(3)} sd=${placebo.placeboSd.toFixed(3)}`
    );
  }

  // Scenario 2
  {
    const model = loadSCM(scenario2);
    const data = simulate(model, 2000, mulberry32(2));
    const estimate = runCausalQuery({
      scm: scenario2,
      query: { effect: "X", on: "Y", population: "synthetic" },
      data,
      evidence: [],
    });
    check("scenario2: correctly refuses identification", estimate.identifiable === false, `identifiable=${estimate.identifiable}`);
    check("scenario2: no numeric estimate leaked", estimate.estimate === undefined, `estimate=${JSON.stringify(estimate.estimate)}`);
    check(
      "scenario2: names the hidden confounder",
      estimate.confoundersSuspected.includes("U"),
      `confoundersSuspected=${JSON.stringify(estimate.confoundersSuspected)}`
    );
    check(
      "scenario2: reports association-only with sensitivity",
      !!estimate.associationOnly && !!estimate.sensitivity,
      `associationOnly=${JSON.stringify(estimate.associationOnly)}`
    );
  }

  // Scenario 3
  {
    const model = loadSCM(scenario3);
    const data = simulate(model, 3000, mulberry32(3));
    const estimate = runCausalQuery({
      scm: scenario3,
      query: { effect: "X", on: "Y", population: "synthetic" },
      data,
      evidence: [],
    });
    check("scenario3: identifiable via frontdoor", estimate.identifiable === true, `identifiable=${estimate.identifiable}, assumptions=${estimate.assumptions[0]}`);
    check(
      "scenario3: mediator found",
      estimate.adjustmentSet.includes("M"),
      `adjustmentSet=${JSON.stringify(estimate.adjustmentSet)}`
    );
    const ate = estimate.estimate?.ate ?? NaN;
    check(
      "scenario3: ATE recovered within +/-0.6 of ground truth 3.0",
      Math.abs(ate - 3.0) < 0.6,
      `estimated ATE=${ate.toFixed(3)} (method=${estimate.estimate?.method})`
    );
  }

  console.log("");
  if (failures > 0) {
    console.error(`eval:causal FAILED — ${failures} check(s) did not pass.`);
    process.exit(1);
  }
  console.log("eval:causal PASSED — ground truth recovered within bounds; confounded case correctly refused.");
}

run();
