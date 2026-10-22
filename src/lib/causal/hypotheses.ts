/**
 * src/lib/causal/hypotheses.ts
 * Catalog of demo causal surfaces for LEADOS. Every number shown is computed
 * live from the estimators in src/lib/causal/estimators/* running against
 * reproducible synthetic datasets (src/data/syntheticDatasets.ts) — nothing
 * here is hand-typed copy. This keeps datasets small enough to compute
 * on mount in the browser; the rigorous, large-N ground-truth validation
 * lives in scripts/evalCausal.ts (Node-only, run via `npm run eval:causal`
 * equivalent).
 */
import type { CausalGraph, CausalClaim } from "./types";
import { buildCausalClaim } from "./hypothesis";
import { explainFromInterval } from "../belief/explain";
import { runDiD } from "./estimators/did";
import { solveSyntheticControl, syntheticControlPlacebo } from "./estimators/syntheticControl";
import { runMatching } from "./estimators/matching";
import { run2SLS } from "./estimators/iv";
import { runRDD } from "./estimators/rdd";
import { runUplift } from "./estimators/uplift";
import { placeboFakeDates, sensitivityForContinuousEstimate } from "./diagnostics";
import { pooledStd } from "../stats";
import { mulberry32 } from "../mathUtils";
import {
  generateDiDDataset,
  generateMatchingDataset,
  generateSyntheticControlDataset,
  generateIVDataset,
  generateRDDDataset,
  generateUpliftDataset,
} from "../../data/syntheticDatasets";

export interface DemoBundle {
  claims: CausalClaim[];
  colliderDemoGraph: CausalGraph;
  uplift: {
    qiniCurve: { fractionTargeted: number; incrementalGain: number }[];
    qiniCoefficient: number;
    averageUplift: number;
  };
}

function cheapPermutationShareSignificant<T extends { treated: boolean; outcome: number }>(
  rows: T[],
  nTrials: number,
  seed: number,
): number {
  const rand = mulberry32(seed);
  const outcomes = rows.map((r) => r.outcome);
  let sig = 0;
  for (let i = 0; i < nTrials; i++) {
    const shuffled = [...rows.map((r) => r.treated)];
    for (let j = shuffled.length - 1; j > 0; j--) {
      const k = Math.floor(rand() * (j + 1));
      [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }
    const treatedVals = outcomes.filter((_, idx) => shuffled[idx]);
    const controlVals = outcomes.filter((_, idx) => !shuffled[idx]);
    const diff = mean(treatedVals) - mean(controlVals);
    const se = Math.sqrt(variance(treatedVals) / treatedVals.length + variance(controlVals) / controlVals.length);
    const z = diff / (se || 1e-9);
    if (Math.abs(z) > 1.645) sig++;
  }
  return sig / nTrials;
}
function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
}
function variance(xs: number[]): number {
  const m = mean(xs);
  return xs.length > 1 ? xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1) : 1;
}

export function buildDemoBundle(): DemoBundle {
  const claims: CausalClaim[] = [];

  // ---------- 1. Difference-in-Differences ----------
  const didDs = generateDiDDataset({ nUnits: 40, nPreriods: 6, nPostPeriods: 4, trueATT: 4, noiseSd: 2.2, seed: 1001 });
  const didResult = runDiD(didDs.data);
  const didPlacebo = placeboFakeDates(didDs.data, 6, { nTrials: 60, seed: 909 });
  const didOutcomeSd = Math.sqrt(variance(didDs.data.map((r) => r.outcome)));
  const didSensitivity = sensitivityForContinuousEstimate(didResult.att / didOutcomeSd, (didResult.att > 0 ? didResult.ci90[0] : didResult.ci90[1]) / didOutcomeSd);
  const didClaim = buildCausalClaim({
    id: "did-outreach-cadence",
    treatment: "Weekly outreach cadence increase",
    outcome: "Deal win rate",
    estimand: "ATT",
    method: "did",
    unit: "percentage points",
    strategy: "Difference-in-differences comparing reps who adopted the new cadence to reps who did not, before vs. after rollout.",
    assumptions: [
      "Parallel trends: absent the change, treated and control reps' win rates would have moved together.",
      "No concurrent shock hit only the treated reps at rollout time (e.g. a territory reshuffle).",
      "Treatment timing is not itself driven by anticipated performance changes.",
    ],
    adjustmentSet: [],
    identificationValidWithoutGraph: {
      valid: true,
      reason: "Parallel-trends design: validity depends on the empirical pre-period trend test below, not a backdoor adjustment set.",
    },
    rawEstimate: explainFromInterval(didResult.att, didResult.ci90[0], didResult.ci90[1], 0.9, "did-twfe", [
      "Assumes no unmeasured confounding between the cadence change and win rate — e.g. a hiring freeze or territory reshuffle could explain both.",
    ]),
    diagnostics: {
      placeboP: didPlacebo.shareSignificant,
      sensitivityBounds: didSensitivity,
      balanceStats: [],
      parallelTrendsP: didResult.parallelTrends.pValue,
    },
  });
  claims.push(didClaim.claim);

  // ---------- 2. Matching / IPW ----------
  const matchDs = generateMatchingDataset({ n: 320, trueATE: 6, noiseSd: 3, seed: 2002 });
  const matchResult = runMatching(matchDs.data);
  const matchPlaceboShare = cheapPermutationShareSignificant(matchDs.data.rows, 40, 707);
  const treatedOutcomes = matchDs.data.rows.filter((r) => r.treated).map((r) => r.outcome);
  const controlOutcomes = matchDs.data.rows.filter((r) => !r.treated).map((r) => r.outcome);
  const matchPooledSd = pooledStd(treatedOutcomes, controlOutcomes);
  const matchSensitivity = sensitivityForContinuousEstimate(
    matchResult.ate / matchPooledSd,
    (matchResult.ate > 0 ? matchResult.ci90[0] : matchResult.ci90[1]) / matchPooledSd,
  );
  const matchGraph: CausalGraph = {
    nodes: [
      { id: "training", label: "Sales enablement training completion", role: "treatment" },
      { id: "quota", label: "Quota attainment", role: "outcome" },
      { id: "tenure", label: "Rep tenure", role: "confounder" },
      { id: "territory", label: "Territory size", role: "confounder" },
    ],
    edges: [
      { from: "tenure", to: "training", kind: "confounder" },
      { from: "tenure", to: "quota", kind: "confounder" },
      { from: "territory", to: "training", kind: "confounder" },
      { from: "territory", to: "quota", kind: "confounder" },
      { from: "training", to: "quota", kind: "causal" },
    ],
  };
  const matchClaim = buildCausalClaim({
    id: "psm-training",
    treatment: "Sales enablement training completion",
    outcome: "Quota attainment",
    estimand: "ATE",
    method: "psm_ipw",
    unit: "percentage points",
    strategy: "Inverse-probability-of-treatment weighting on a logistic propensity model using rep tenure and territory size.",
    assumptions: [
      "No unmeasured confounding: tenure and territory size capture the main drivers of both training uptake and quota attainment.",
      "Overlap: every rep had a realistic chance of completing or not completing training given their covariates.",
      "Correct propensity model functional form (logistic, linear in covariates).",
    ],
    adjustmentSet: ["tenure", "territory"],
    graph: matchGraph,
    rawEstimate: explainFromInterval(matchResult.ate, matchResult.ci90[0], matchResult.ci90[1], 0.9, "psm-ipw", [
      "Assumes no unmeasured confounding between training completion and quota attainment — e.g. manager-assigned stretch goals could explain both.",
    ]),
    diagnostics: {
      placeboP: matchPlaceboShare,
      sensitivityBounds: matchSensitivity,
      balanceStats: matchResult.balance,
    },
  });
  claims.push(matchClaim.claim);

  // ---------- 3. Synthetic Control ----------
  const scDs = generateSyntheticControlDataset({ nDonors: 14, nPrePeriods: 10, nPostPeriods: 5, trueATT: -8, noiseSd: 0.35, seed: 3003 });
  const scResult = solveSyntheticControl(scDs.data);
  const scPlacebo = syntheticControlPlacebo(scDs.data, scResult.rmspeRatio);
  // Pre-period FIT QUALITY (normalized by the treated unit's own pre-period
  // variability) is the right accuracy gate — NOT the raw post/pre RMSPE
  // ratio, which is *expected* to be large whenever there is a real effect
  // (the post period necessarily diverges from a tightly-fit pre period).
  // The raw ratio is only meaningful in the relative, placebo-in-space sense
  // used by `scPlacebo` above. Conflating the two very nearly caused this
  // claim to be mislabeled "associational" purely because the design worked;
  // caught via `causal:lint`'s self-test (see AI-SESSION-LOG.md).
  const scPrePeriod = scDs.data.treated.slice(0, scDs.data.interventionIndex);
  const scPreMean = scPrePeriod.reduce((a, b) => a + b, 0) / scPrePeriod.length;
  const scPreStd = Math.sqrt(scPrePeriod.reduce((s, v) => s + (v - scPreMean) ** 2, 0) / scPrePeriod.length) || 1e-9;
  const scNormalizedPreFit = scResult.preRmspe / scPreStd;
  const scClaim = buildCausalClaim({
    id: "synth-control-price",
    treatment: "Region C self-serve price change",
    outcome: "Regional weekly revenue index",
    estimand: "ATT",
    method: "synthetic_control",
    unit: "index points/week",
    strategy: "Synthetic control: a weighted combination of 14 donor regions is built to track Region C's pre-change revenue index, then compared post-change.",
    assumptions: [
      "The donor pool contains no region that was simultaneously exposed to the same shock as Region C.",
      "The synthetic control closely tracks Region C during the pre-period (see RMSPE diagnostic).",
      "Relative weights of donor regions remain stable across the evaluation window.",
    ],
    adjustmentSet: [],
    identificationValidWithoutGraph: {
      valid: scNormalizedPreFit < 0.25,
      reason: "Single-unit comparative case study: validity rests on pre-period fit quality (preRMSPE / pre-period outcome SD) and no concurrent region-specific shock.",
    },
    rawEstimate: explainFromInterval(scResult.att, scResult.att - 1.645 * scResult.postRmspe, scResult.att + 1.645 * scResult.postRmspe, 0.9, "synthetic-control", [
      "Assumes no unmeasured confounding between the price change and revenue — e.g. a regional competitor promotion could explain both.",
    ]),
    diagnostics: {
      placeboP: scPlacebo.pValue,
      sensitivityBounds: { type: "none", value: null, interpretation: "E-value/Rosenbaum sensitivity analysis targets confounded individual-level comparisons; the main threat here is a concurrent region-specific shock, which the placebo-in-space test above addresses instead." },
      balanceStats: [],
      rmspeRatio: scResult.rmspeRatio,
    },
  });
  claims.push(scClaim.claim);

  // ---------- 4. Instrumental Variables / 2SLS ----------
  const ivDs = generateIVDataset({ n: 320, trueLATE: 0.05, instrumentStrength: 1.1, confounding: 1.3, seed: 4004 });
  const ivResult = run2SLS(ivDs.data);
  const ivClaim = buildCausalClaim({
    id: "iv-lead-scoring",
    treatment: "Lead-scoring tool adoption",
    outcome: "Lead-to-opportunity conversion rate",
    estimand: "CATE",
    method: "iv_2sls",
    unit: "share (0-1) of leads",
    strategy: "Two-stage least squares using staggered rollout-wave assignment (batch lottery) as an instrument for adoption.",
    assumptions: [
      "Relevance: rollout wave meaningfully predicts adoption (see first-stage F-stat).",
      "Exclusion restriction: rollout wave affects conversion only through adoption, not through any other channel.",
      "No defiers: nobody adopts the tool specifically because they were NOT assigned an early wave.",
    ],
    adjustmentSet: [],
    identificationValidWithoutGraph: {
      valid: !ivResult.weakInstrument,
      reason: "Instrumental-variables design: validity rests on instrument relevance (first-stage F-stat) and the exclusion restriction, which cannot be tested directly from data.",
    },
    rawEstimate: explainFromInterval(ivResult.late, ivResult.ci90[0], ivResult.ci90[1], 0.9, "2sls", [
      "Assumes the exclusion restriction holds — e.g. that rollout wave does not also correlate with rep seniority in a way that independently affects conversion.",
    ]),
    diagnostics: {
      placeboP: null,
      sensitivityBounds: { type: "none", value: null, interpretation: "IV designs are threatened by exclusion-restriction violations, not by observed-covariate confounding, so E-value/Rosenbaum bounds do not apply; the first-stage F-stat below is the relevant diagnostic." },
      balanceStats: [],
      firstStageF: ivResult.firstStageF,
    },
  });
  claims.push(ivClaim.claim);

  // ---------- 5. Regression Discontinuity ----------
  const rddDs = generateRDDDataset({ n: 320, trueJump: -3, cutoff: 0, noiseSd: 0.7, seed: 5005 });
  const rddResult = runRDD(rddDs.data);
  const rddClaim = buildCausalClaim({
    id: "rdd-approval-threshold",
    treatment: "Deal size crossing the $50k manager-approval threshold",
    outcome: "Approval cycle time (days)",
    estimand: "CATE",
    method: "rdd",
    unit: "days",
    strategy: "Sharp regression discontinuity: local-linear regression on each side of the $50k rule, bandwidth-sensitivity checked.",
    assumptions: [
      "No manipulation of deal size to land just above/below the threshold.",
      "All other deal characteristics vary smoothly through the cutoff.",
      "The local-linear functional form is adequate within the chosen bandwidth.",
    ],
    adjustmentSet: [],
    identificationValidWithoutGraph: {
      valid: rddResult.stable,
      reason: "Local-randomization design: validity rests on smoothness through the cutoff and stability of the estimate across bandwidths (checked below), not a backdoor adjustment set.",
    },
    rawEstimate: explainFromInterval(rddResult.jump, rddResult.ci90[0], rddResult.ci90[1], 0.9, "rdd-local-linear", [
      "Assumes deals are not strategically sized to dodge the approval threshold — e.g. reps splitting deals to stay under $50k could bias this.",
    ]),
    diagnostics: {
      placeboP: null,
      sensitivityBounds: { type: "none", value: null, interpretation: "RDD's main threat is manipulation of the running variable around the cutoff, not confounding addressed by E-value/Rosenbaum bounds; the bandwidth-sensitivity check below is the relevant diagnostic." },
      balanceStats: [],
    },
  });
  claims.push(rddClaim.claim);

  // ---------- Uplift modeling (targeting tool, not a single ATE claim) ----------
  const upliftDs = generateUpliftDataset({ n: 400, seed: 6006 });
  const upliftResult = runUplift(upliftDs.data);

  // ---------- Collider / M-bias demonstration graph (for the "why we refuse" panel) ----------
  const colliderDemoGraph: CausalGraph = {
    nodes: [
      { id: "X", label: "Treatment (X)", role: "treatment" },
      { id: "Y", label: "Outcome (Y)", role: "outcome" },
      { id: "U1", label: "Unobserved factor U1", role: "confounder" },
      { id: "U2", label: "Unobserved factor U2", role: "confounder" },
      { id: "M", label: "Observed variable M (collider)", role: "collider" },
    ],
    edges: [
      { from: "U1", to: "X", kind: "confounder" },
      { from: "U1", to: "M", kind: "collider" },
      { from: "U2", to: "M", kind: "collider" },
      { from: "U2", to: "Y", kind: "confounder" },
      { from: "X", to: "Y", kind: "causal" },
    ],
  };

  return {
    claims,
    colliderDemoGraph,
    uplift: { qiniCurve: upliftResult.qiniCurve, qiniCoefficient: upliftResult.qiniCoefficient, averageUplift: upliftResult.averageUplift },
  };
}
