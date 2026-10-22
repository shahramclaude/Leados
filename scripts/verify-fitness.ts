// LEADOS — Part 39: `npm run verify`
//
// Pure, DB-free verification of the fitness function, Goodhart detectors,
// evolution-loop gate, and counterfactual estimator. Exits non-zero on any
// failure. Run with: npx tsx scripts/verify-fitness.ts

import { computeFitness, sumContributions } from "../src/lib/fitness/compute";
import { DIMENSIONS, METRICS, defaultWeightMap } from "../src/lib/fitness/dimensions";
import { normalizeMetric, normalizeDerivative } from "../src/lib/fitness/normalize";
import { analyzeGoodhartPair } from "../src/lib/fitness/goodhart";
import { estimateCounterfactual, groundTruthHarness, fitLinearTrend } from "../src/lib/fitness/counterfactual";
import { validateTransition, EvolutionLoopTransitionError, type EvolutionLoopState } from "../src/lib/fitness/evolutionLoop";
import { LEGACY_HEALTH_SCORES } from "../src/lib/fitness/legacy";
import type { WeightMap } from "../src/lib/fitness/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` — ${detail}` : ""));
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

function approxEqual(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

function midValues(): Record<string, number> {
  const values: Record<string, number> = {};
  for (const m of METRICS) values[m.id] = (m.min + m.max) / 2;
  return values;
}

console.log("\n=== PHASE 4 GATE 1: Decomposition — fitness fully decomposes to evidence-classed raw metrics ===\n");
{
  const weights = defaultWeightMap();
  const values = midValues();
  const result = computeFitness({ weights, metricValues: values });

  const evidenceClasses = new Set(["measured", "derived", "self_reported", "proxy"]);
  const allMetricsClassed = result.dimensions.every((d) => d.metrics.every((m) => evidenceClasses.has(m.evidenceClass)));
  check("every raw metric carries a declared evidence class", allMetricsClassed);

  const allDimsHaveMetrics = result.dimensions.every((d) => d.metrics.length > 0);
  check("every dimension decomposes into at least one raw metric (no opaque dimension)", allDimsHaveMetrics);

  const sum = sumContributions(result);
  check(
    "decomposability: sum of per-dimension contributions equals fitness",
    approxEqual(sum, result.fitness, 1e-9),
    `sum=${sum}, fitness=${result.fitness}`,
  );

  const totalMetrics = result.dimensions.reduce((s, d) => s + d.metrics.length, 0);
  check("all 7 declared dimensions present", result.dimensions.length === DIMENSIONS.length);
  check("all declared metrics accounted for", totalMetrics === METRICS.length, `${totalMetrics} vs ${METRICS.length}`);
}

console.log("\n=== PHASE 3(a) property tests: weight normalization, monotonicity, decomposability ===\n");
{
  // Property: normalized weights always sum to 1 regardless of raw weight magnitudes.
  const randomWeights: WeightMap = {};
  for (const d of DIMENSIONS) randomWeights[d.id] = { weight: Math.random() * 10 + 0.01, rationale: "property test" };
  const values = midValues();
  const result = computeFitness({ weights: randomWeights, metricValues: values });
  const sumNormalized = result.dimensions.reduce((s, d) => s + d.normalizedWeight, 0);
  check("weight normalization: Σ normalizedWeight = 1", approxEqual(sumNormalized, 1, 1e-9), `got ${sumNormalized}`);

  // Property: decomposability holds for 20 random weight draws.
  let allDecompose = true;
  for (let i = 0; i < 20; i++) {
    const w: WeightMap = {};
    for (const d of DIMENSIONS) w[d.id] = { weight: Math.random() * 5 + 0.001, rationale: "r" };
    const r = computeFitness({ weights: w, metricValues: values });
    if (!approxEqual(sumContributions(r), r.fitness, 1e-9)) allDecompose = false;
  }
  check("decomposability holds across 20 random weight draws", allDecompose);

  // Property: monotonicity — improving ANY metric in its "good" direction never decreases fitness.
  let monotonic = true;
  const baseline = computeFitness({ weights: defaultWeightMap(), metricValues: values });
  for (const metric of METRICS) {
    const improved = { ...values };
    const step = (metric.max - metric.min) * 0.05;
    improved[metric.id] =
      metric.direction === "higher_better"
        ? Math.min(metric.max, values[metric.id] + step)
        : Math.max(metric.min, values[metric.id] - step);
    const r = computeFitness({ weights: defaultWeightMap(), metricValues: improved });
    if (r.fitness < baseline.fitness - 1e-9) monotonic = false;
  }
  check("monotonicity: improving any single metric never decreases fitness", monotonic);

  // Property: worsening any metric never increases fitness.
  let monotonicDown = true;
  for (const metric of METRICS) {
    const worsened = { ...values };
    const step = (metric.max - metric.min) * 0.05;
    worsened[metric.id] =
      metric.direction === "higher_better"
        ? Math.max(metric.min, values[metric.id] - step)
        : Math.min(metric.max, values[metric.id] + step);
    const r = computeFitness({ weights: defaultWeightMap(), metricValues: worsened });
    if (r.fitness > baseline.fitness + 1e-9) monotonicDown = false;
  }
  check("monotonicity: worsening any single metric never increases fitness", monotonicDown);
}

console.log("\n=== PHASE 4 GATE 2: Sensitivity math correct on hand-computed fixtures ===\n");
{
  // Fixture: two dimensions, two metrics each, hand-computed by hand.
  // Use the real catalog but override with a tiny closed-form check using
  // normalize.ts directly (this isolates the derivative formula itself).
  const metric = METRICS.find((m) => m.id === "delivery_velocity")!; // higher_better, min 0 max 200
  const valueInBounds = 80;
  const derivExpected = 1 / (metric.max - metric.min); // = 1/200 = 0.005
  const derivGot = normalizeDerivative(metric, valueInBounds);
  check("∂normalize/∂value for higher_better metric in-bounds = 1/(max-min)", approxEqual(derivGot, derivExpected), `expected ${derivExpected}, got ${derivGot}`);

  const lowerMetric = METRICS.find((m) => m.id === "rework_rate")!; // lower_better, min 0 max 60
  const derivExpectedLower = -1 / (lowerMetric.max - lowerMetric.min); // -1/60
  const derivGotLower = normalizeDerivative(lowerMetric, 14);
  check(
    "∂normalize/∂value for lower_better metric in-bounds = -1/(max-min)",
    approxEqual(derivGotLower, derivExpectedLower),
    `expected ${derivExpectedLower}, got ${derivGotLower}`,
  );

  const outOfBoundsDeriv = normalizeDerivative(metric, 500);
  check("∂normalize/∂value = 0 outside bounds (clamped region)", outOfBoundsDeriv === 0);

  // Full-system fixture: hand-computed weight sensitivity.
  // Two dimensions A (w=1, D_A=0.8) and B (w=3, D_B=0.4) — but we must use the
  // real catalog, so instead verify the CLOSED-FORM directly against compute():
  // Fitness = Σ n_i D_i ; ∂Fitness/∂w_i = (D_i - Fitness)/W
  const weights = defaultWeightMap();
  const values = midValues();
  const result = computeFitness({ weights, metricValues: values });
  const W = result.totalRawWeight;
  let weightSensitivityCorrect = true;
  for (const d of result.dimensions) {
    const expected = (d.score - result.fitness) / W;
    if (!approxEqual(d.weightSensitivity, expected, 1e-9)) weightSensitivityCorrect = false;
  }
  check("∂Fitness/∂w_i matches closed form (D_i - Fitness)/W for every dimension", weightSensitivityCorrect);

  // Numerical finite-difference cross-check against the analytic weight sensitivity.
  let fdMatches = true;
  const h = 1e-6;
  for (const dim of DIMENSIONS) {
    const bumped: WeightMap = JSON.parse(JSON.stringify(weights));
    bumped[dim.id].weight += h;
    const bumpedResult = computeFitness({ weights: bumped, metricValues: values });
    const fd = (bumpedResult.fitness - result.fitness) / h;
    const analytic = result.dimensions.find((d) => d.id === dim.id)!.weightSensitivity;
    if (!approxEqual(fd, analytic, 1e-3)) fdMatches = false;
  }
  check("finite-difference cross-check matches analytic ∂Fitness/∂w_i within tolerance", fdMatches);

  // Numerical finite-difference cross-check for metric sensitivity.
  let fdMetricMatches = true;
  for (const metricDef of METRICS.slice(0, 6)) {
    const bumpedValues = { ...values };
    const hm = (metricDef.max - metricDef.min) * 1e-5;
    bumpedValues[metricDef.id] += hm;
    const bumpedResult = computeFitness({ weights, metricValues: bumpedValues });
    const fd = (bumpedResult.fitness - result.fitness) / hm;
    const dim = result.dimensions.find((d) => d.id === metricDef.dimensionId)!;
    const analytic = dim.metrics.find((m) => m.id === metricDef.id)!.sensitivity;
    if (!approxEqual(fd, analytic, 1e-3)) fdMetricMatches = false;
  }
  check("finite-difference cross-check matches analytic ∂Fitness/∂value_m within tolerance", fdMetricMatches);
}

console.log("\n=== PHASE 4 GATE 3: Gaming-resistance tests — seeded metric manipulation detected by counter-metrics ===\n");
{
  const velocity = METRICS.find((m) => m.id === "delivery_velocity")!;

  // Scenario A: genuine improvement — velocity up, rework DOWN. Should NOT be flagged.
  const genuine = analyzeGoodhartPair(velocity, 80, 100, 14, 10);
  check("genuine improvement (velocity up, rework down) is NOT flagged suspicious", !genuine.suspicious);

  // Scenario B: gaming — velocity up, rework ALSO up by a lot. Should be flagged.
  const gamed = analyzeGoodhartPair(velocity, 80, 110, 14, 30);
  check("gamed improvement (velocity up, rework up) IS flagged suspicious", gamed.suspicious, gamed.note);
  check("gamed finding has non-info severity", gamed.severity !== "info");

  // Scenario C: adoption vs outcome realization classic Goodhart.
  const adoption = METRICS.find((m) => m.id === "decision_adoption_rate")!;
  const gamedAdoption = analyzeGoodhartPair(adoption, 60, 85, 54, 40);
  check(
    "adoption-up/outcome-down (mandate-without-outcome) IS flagged suspicious",
    gamedAdoption.suspicious,
    gamedAdoption.note,
  );

  // Scenario D: both improving together — should not be flagged even with large deltas.
  const bothImprove = analyzeGoodhartPair(adoption, 60, 85, 54, 75);
  check("both metric and counter-metric improving together is NOT flagged", !bothImprove.suspicious);

  // Every metric in the catalog has an authored Goodhart risk and counter-metric.
  const allHaveGoodhartDocs = METRICS.every((m) => m.goodhartRisk.length > 10 && m.counterMetricId && m.counterRationale.length > 10);
  check("every declared metric has an authored Goodhart risk + counter-metric + rationale", allHaveGoodhartDocs);

  // Counter-metric references are valid (point to a real metric).
  const allCounterRefsValid = METRICS.every((m) => METRICS.some((c) => c.id === m.counterMetricId));
  check("every counter-metric id resolves to a real declared metric", allCounterRefsValid);
}

console.log("\n=== PHASE 4 GATE 4: Evolution-loop transcript — hypothesis -> twin -> decision -> intervention -> outcome -> belief, human-gated ===\n");
{
  let state: EvolutionLoopState = { stage: "hypothesis", decisionTier: "T3", approvedBy: null, approvedAt: null };

  console.log("  transcript: hypothesis -> twin_predicted");
  validateTransition(state, "twin_predicted");
  state = { ...state, stage: "twin_predicted" };
  check("hypothesis -> twin_predicted allowed", true);

  console.log("  transcript: twin_predicted -> decision_pending");
  validateTransition(state, "decision_pending");
  state = { ...state, stage: "decision_pending" };
  check("twin_predicted -> decision_pending allowed", true);

  console.log("  transcript: attempt decision_pending -> executing WITHOUT approval (must be rejected)");
  let blockedSkip = false;
  try {
    validateTransition(state, "executing");
  } catch (e) {
    blockedSkip = e instanceof EvolutionLoopTransitionError;
  }
  check("cannot skip straight to executing without human approval", blockedSkip);

  console.log("  transcript: attempt decision_approved WITHOUT named approver (must be rejected)");
  let blockedNoApprover = false;
  try {
    validateTransition(state, "decision_approved", {});
  } catch (e) {
    blockedNoApprover = e instanceof EvolutionLoopTransitionError;
  }
  check("cannot approve without a named human approver", blockedNoApprover);

  console.log("  transcript: decision_pending -> decision_approved WITH named human approver (T3) — the gated step");
  validateTransition(state, "decision_approved", { approvedBy: "COO (human)" });
  state = { ...state, stage: "decision_approved", approvedBy: "COO (human)", approvedAt: new Date().toISOString() };
  check("decision_approved reached only via explicit human approval on a T3 loop", true);

  console.log("  transcript: decision_approved -> executing (now permitted, approver on file)");
  validateTransition(state, "executing");
  state = { ...state, stage: "executing" };
  check("executing reached only after approvedBy/approvedAt present", true);

  console.log("  transcript: executing -> measured");
  validateTransition(state, "measured");
  state = { ...state, stage: "measured" };
  check("executing -> measured allowed", true);

  console.log("  transcript: measured -> belief_updated");
  validateTransition(state, "belief_updated");
  state = { ...state, stage: "belief_updated" };
  check("measured -> belief_updated allowed", true);

  console.log("  transcript: belief_updated is terminal (no further transitions)");
  let terminalBlocked = false;
  try {
    validateTransition(state, "hypothesis");
  } catch (e) {
    terminalBlocked = e instanceof EvolutionLoopTransitionError;
  }
  check("belief_updated is a terminal stage", terminalBlocked);

  // T1/T2 tier should never be allowed to self-approve via this gate either — only T3 loops exist in this engine.
  const t2State: EvolutionLoopState = { stage: "decision_pending", decisionTier: "T2", approvedBy: null, approvedAt: null };
  let t2Blocked = false;
  try {
    validateTransition(t2State, "decision_approved", { approvedBy: "someone" });
  } catch (e) {
    t2Blocked = e instanceof EvolutionLoopTransitionError;
  }
  check("non-T3 decision tiers are rejected by the evolution-loop approval gate", t2Blocked);
}

console.log("\n=== PHASE 4 GATE 5: Counterfactual estimator ground-truth harness (declared-proxy honesty) ===\n");
{
  // Harness 1: zero noise, should recover the injected effect almost exactly.
  const h1 = groundTruthHarness({ preLength: 6, postLength: 4, trueSlope: 0.01, trueIntercept: 0.5, trueEffect: 0.05 });
  check("ground-truth harness recovers known effect with zero noise (tight tolerance)", h1.withinTolerance, `recovered=${h1.recoveredEffect}, true=${h1.trueEffect}, err=${h1.absoluteError}`);

  // Harness 2: small deterministic noise, should still recover within tolerance.
  const noise = (t: number) => (t % 2 === 0 ? 0.003 : -0.003);
  const h2 = groundTruthHarness({ preLength: 8, postLength: 4, trueSlope: -0.005, trueIntercept: 0.6, trueEffect: -0.03, noise });
  check("ground-truth harness recovers known negative effect with small noise", h2.withinTolerance, `recovered=${h2.recoveredEffect}, true=${h2.trueEffect}, err=${h2.absoluteError}`);

  // Harness 3: no injected effect (null case) — estimator should report ~0 effect.
  const h3 = groundTruthHarness({ preLength: 6, postLength: 4, trueSlope: 0.02, trueIntercept: 0.4, trueEffect: 0 });
  check("ground-truth harness reports ~0 effect when no intervention effect exists (no false positive)", h3.withinTolerance, `recovered=${h3.recoveredEffect}`);

  // Sanity: fitLinearTrend recovers an exact known line with zero noise.
  const pts = [0, 1, 2, 3].map((t) => ({ t, value: 2 + 3 * t }));
  const { slope, intercept } = fitLinearTrend(pts);
  check("fitLinearTrend recovers exact slope/intercept on a noiseless line", approxEqual(slope, 3) && approxEqual(intercept, 2));

  // The estimator always carries its caveat (honesty rule: declared proxy, not ground truth).
  const result = estimateCounterfactual(
    [0, 1, 2].map((t) => ({ t, value: t })),
    [3, 4].map((t) => ({ t, value: t + 1 })),
  );
  check("counterfactual result always carries an explicit caveat string", result.caveat.toLowerCase().includes("declared proxy"));
}

console.log("\n=== Additional honesty checks ===\n");
{
  check("legacy health-score audit catalog is non-empty (Phase 0 discovery documented)", LEGACY_HEALTH_SCORES.length >= 4);
  check("every legacy score entry documents gaming notes", LEGACY_HEALTH_SCORES.every((l) => l.gamingNotes.length > 10));
  check("every legacy score entry is marked with a disposition note", LEGACY_HEALTH_SCORES.every((l) => l.deprecatedNote.length > 10));

  // Weights-missing-rationale should be structurally impossible to activate via the API contract type.
  const weights = defaultWeightMap();
  const allHaveRationale = DIMENSIONS.every((d) => weights[d.id].rationale.length > 0);
  check("default policy seed carries a rationale for every dimension weight", allHaveRationale);
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) {
  console.error("FAILURES:\n" + failures.map((f) => " - " + f).join("\n"));
  process.exit(1);
} else {
  console.log("All fitness-function, gaming-resistance, evolution-loop, and counterfactual checks passed.");
  process.exit(0);
}
