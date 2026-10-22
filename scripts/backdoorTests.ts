/**
 * scripts/backdoorTests.ts
 * Phase 4, Gate (2): "backdoor tests green including a collider case that
 * must refuse adjustment."
 * Runs scripts/backdoorTests.ts as the functional-test suite for
 * src/lib/causal/graph.ts's checkBackdoorCriterion().
 *
 * Run with:  npx tsx scripts/backdoorTests.ts
 */
import { checkBackdoorCriterion } from "../src/lib/causal/graph";
import type { CausalGraph } from "../src/lib/causal/types";
import { Harness } from "./testHarness";

const h = new Harness("backdoor-criterion");

// ---- Case 1: simple single confounder ----
// Z -> X, Z -> Y, X -> Y. Only backdoor path: X <- Z -> Y.
const g1: CausalGraph = {
  nodes: [
    { id: "X", label: "X", role: "treatment" },
    { id: "Y", label: "Y", role: "outcome" },
    { id: "Z", label: "Z", role: "confounder" },
  ],
  edges: [
    { from: "Z", to: "X", kind: "confounder" },
    { from: "Z", to: "Y", kind: "confounder" },
    { from: "X", to: "Y", kind: "causal" },
  ],
};
{
  const withZ = checkBackdoorCriterion(g1, "X", "Y", ["Z"]);
  h.check("case1: {Z} is a valid adjustment set", withZ.valid === true, JSON.stringify(withZ.reasons));
  const withoutZ = checkBackdoorCriterion(g1, "X", "Y", []);
  h.check("case1: {} is NOT a valid adjustment set (open backdoor path)", withoutZ.valid === false);
  h.check("case1: {} correctly identifies the single backdoor path X-Z-Y", withoutZ.backdoorPaths.length === 1 && withoutZ.unblockedPaths.length === 1);
}

// ---- Case 2: mediator must not be adjusted for ----
// Z -> X, Z -> Y (confounder), X -> M -> Y (mediator chain)
const g2: CausalGraph = {
  nodes: [
    { id: "X", label: "X", role: "treatment" },
    { id: "Y", label: "Y", role: "outcome" },
    { id: "Z", label: "Z", role: "confounder" },
    { id: "M", label: "M", role: "mediator" },
  ],
  edges: [
    { from: "Z", to: "X", kind: "confounder" },
    { from: "Z", to: "Y", kind: "confounder" },
    { from: "X", to: "M", kind: "mediator" },
    { from: "M", to: "Y", kind: "mediator" },
  ],
};
{
  const correct = checkBackdoorCriterion(g2, "X", "Y", ["Z"]);
  h.check("case2: {Z} (excluding mediator M) is valid", correct.valid === true, JSON.stringify(correct.reasons));
  const wrong = checkBackdoorCriterion(g2, "X", "Y", ["Z", "M"]);
  h.check("case2: {Z, M} is INVALID because M is a descendant of treatment", wrong.valid === false && wrong.descendantViolations.includes("M"));
}

// ---- Case 3: M-bias collider — MUST refuse adjustment on the collider ----
// U1 -> X, U1 -> M, U2 -> M, U2 -> Y, X -> Y. M is a collider on the only
// backdoor path (X <- U1 -> M <- U2 -> Y), which is blocked BY DEFAULT.
// Adjusting for M opens it — this must be refused.
const g3: CausalGraph = {
  nodes: [
    { id: "X", label: "X", role: "treatment" },
    { id: "Y", label: "Y", role: "outcome" },
    { id: "U1", label: "U1", role: "confounder" },
    { id: "U2", label: "U2", role: "confounder" },
    { id: "M", label: "M", role: "collider" },
  ],
  edges: [
    { from: "U1", to: "X", kind: "confounder" },
    { from: "U1", to: "M", kind: "collider" },
    { from: "U2", to: "M", kind: "collider" },
    { from: "U2", to: "Y", kind: "confounder" },
    { from: "X", to: "Y", kind: "causal" },
  ],
};
{
  const empty = checkBackdoorCriterion(g3, "X", "Y", []);
  h.check("case3: {} is valid — the collider M blocks the only backdoor path by default", empty.valid === true, JSON.stringify(empty.reasons));
  const adjustOnCollider = checkBackdoorCriterion(g3, "X", "Y", ["M"]);
  h.check(
    "case3: {M} MUST be refused — conditioning on the collider opens a spurious path",
    adjustOnCollider.valid === false && adjustOnCollider.colliderViolations.length > 0,
    JSON.stringify(adjustOnCollider.reasons),
  );
}

// ---- Case 4: two independent confounders, both required ----
const g4: CausalGraph = {
  nodes: [
    { id: "X", label: "X", role: "treatment" },
    { id: "Y", label: "Y", role: "outcome" },
    { id: "Z1", label: "Z1", role: "confounder" },
    { id: "Z2", label: "Z2", role: "confounder" },
  ],
  edges: [
    { from: "Z1", to: "X", kind: "confounder" },
    { from: "Z1", to: "Y", kind: "confounder" },
    { from: "Z2", to: "X", kind: "confounder" },
    { from: "Z2", to: "Y", kind: "confounder" },
    { from: "X", to: "Y", kind: "causal" },
  ],
};
{
  const partial = checkBackdoorCriterion(g4, "X", "Y", ["Z1"]);
  h.check("case4: {Z1} alone is NOT sufficient (Z2 path still open)", partial.valid === false);
  const full = checkBackdoorCriterion(g4, "X", "Y", ["Z1", "Z2"]);
  h.check("case4: {Z1, Z2} is sufficient", full.valid === true, JSON.stringify(full.reasons));
}

const ok = h.summarize();
if (!ok) process.exit(1);
