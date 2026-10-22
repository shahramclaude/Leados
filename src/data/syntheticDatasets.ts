/**
 * src/data/syntheticDatasets.ts
 * Synthetic structural-causal-model (SCM) data generators with KNOWN ground
 * truth effects. Used by both the ground-truth evaluation harness
 * (scripts/evalCausal.ts) and the UI demo cards, so every number shown in
 * the product is reproducible from a documented data-generating process —
 * never hand-typed copy.
 */
import { mulberry32, randNormal, logistic } from "../lib/mathUtils";
import type { DiDRow } from "../lib/causal/estimators/did";
import type { MatchingInput } from "../lib/causal/estimators/matching";
import type { SyntheticControlInput } from "../lib/causal/estimators/syntheticControl";
import type { IVInput } from "../lib/causal/estimators/iv";
import type { RDDInput } from "../lib/causal/estimators/rdd";
import type { UpliftRow } from "../lib/causal/estimators/uplift";

export interface GroundTruthDataset<T> {
  data: T;
  trueEffect: number;
  seed: number;
}

/** DiD: two-way panel with a shared linear time trend (parallel trends holds by construction) and a known ATT. */
export function generateDiDDataset(opts: {
  nUnits: number;
  nPreriods?: number;
  nPostPeriods?: number;
  trueATT: number;
  noiseSd?: number;
  seed: number;
  violateParallelTrends?: boolean;
}): GroundTruthDataset<DiDRow[]> {
  const { nUnits, nPreriods = 4, nPostPeriods = 4, trueATT, noiseSd = 1, seed, violateParallelTrends = false } = opts;
  const rand = mulberry32(seed);
  const rows: DiDRow[] = [];
  const nTimes = nPreriods + nPostPeriods;
  for (let u = 0; u < nUnits; u++) {
    const treatedGroup = u < nUnits / 2;
    const unitFE = randNormal(rand, 0, 2);
    const differentialTrendSlope = violateParallelTrends && treatedGroup ? 0.4 : 0;
    for (let t = 0; t < nTimes; t++) {
      const post = t >= nPreriods;
      const commonTrend = 0.5 * t;
      const diffTrend = differentialTrendSlope * t;
      const effect = treatedGroup && post ? trueATT : 0;
      const noise = randNormal(rand, 0, noiseSd);
      rows.push({ unit: `u${u}`, time: t, treatedGroup, post, outcome: unitFE + commonTrend + diffTrend + effect + noise });
    }
  }
  return { data: rows, trueEffect: trueATT, seed };
}

/** Synthetic control: donor pool sharing latent factors with the treated unit; known constant post-period ATT. */
export function generateSyntheticControlDataset(opts: {
  nDonors: number;
  nPrePeriods?: number;
  nPostPeriods?: number;
  trueATT: number;
  noiseSd?: number;
  seed: number;
}): GroundTruthDataset<SyntheticControlInput> {
  const { nDonors, nPrePeriods = 10, nPostPeriods = 5, trueATT, noiseSd = 0.5, seed } = opts;
  const rand = mulberry32(seed);
  const nTimes = nPrePeriods + nPostPeriods;
  const nFactors = 3;
  const factors: number[][] = Array.from({ length: nFactors }, () =>
    Array.from({ length: nTimes }, (_, t) => Math.sin(t / 2 + randNormal(rand, 0, 0.1)) + 0.1 * t),
  );
  const treatedLoadings = Array.from({ length: nFactors }, () => randNormal(rand, 1, 0.3));
  const donors = Array.from({ length: nDonors }, (_, j) => {
    const loadings = Array.from({ length: nFactors }, () => randNormal(rand, 1, 0.5));
    const series = Array.from({ length: nTimes }, (_, t) => {
      const base = loadings.reduce((s, l, k) => s + l * factors[k][t], 0);
      return base + randNormal(rand, 0, noiseSd);
    });
    return { id: `donor_${j}`, series };
  });
  const treated = Array.from({ length: nTimes }, (_, t) => {
    const base = treatedLoadings.reduce((s, l, k) => s + l * factors[k][t], 0);
    const effect = t >= nPrePeriods ? trueATT : 0;
    return base + effect + randNormal(rand, 0, noiseSd);
  });
  return { data: { treated, donors, interventionIndex: nPrePeriods }, trueEffect: trueATT, seed };
}

/** Matching/IPW: confounded treatment assignment via logistic propensity on two covariates, known ATE. */
export function generateMatchingDataset(opts: {
  n: number;
  trueATE: number;
  noiseSd?: number;
  seed: number;
}): GroundTruthDataset<MatchingInput> {
  const { n, trueATE, noiseSd = 1.5, seed } = opts;
  const rand = mulberry32(seed);
  const rows: MatchingInput["rows"] = [];
  for (let i = 0; i < n; i++) {
    const x1 = randNormal(rand, 0, 1);
    const x2 = randNormal(rand, 0, 1);
    const propensity = logistic(0.8 * x1 - 0.5 * x2);
    const treated = rand() < propensity;
    const outcome = 2 + 1.5 * x1 - 1.0 * x2 + (treated ? trueATE : 0) + randNormal(rand, 0, noiseSd);
    rows.push({ covariates: [x1, x2], treated, outcome });
  }
  return { data: { covariateNames: ["x1", "x2"], rows }, trueEffect: trueATE, seed };
}

/** IV/2SLS: unmeasured confounder U affects both treatment and outcome; instrument Z is independent of U, known LATE. */
export function generateIVDataset(opts: {
  n: number;
  trueLATE: number;
  instrumentStrength?: number;
  confounding?: number;
  seed: number;
}): GroundTruthDataset<IVInput> {
  const { n, trueLATE, instrumentStrength = 1.2, confounding = 1.5, seed } = opts;
  const rand = mulberry32(seed);
  const outcome: number[] = [];
  const treatment: number[] = [];
  const instrument: number[] = [];
  for (let i = 0; i < n; i++) {
    const z = randNormal(rand, 0, 1);
    const u = randNormal(rand, 0, 1);
    const d = instrumentStrength * z + confounding * u + randNormal(rand, 0, 0.5);
    const y = trueLATE * d + confounding * 1.2 * u + randNormal(rand, 0, 0.5);
    instrument.push(z);
    treatment.push(d);
    outcome.push(y);
  }
  return { data: { outcome, treatment, instrument }, trueEffect: trueLATE, seed };
}

/** RDD: smooth running-variable relationship plus a known jump at the cutoff. */
export function generateRDDDataset(opts: {
  n: number;
  trueJump: number;
  cutoff?: number;
  noiseSd?: number;
  seed: number;
}): GroundTruthDataset<RDDInput> {
  const { n, trueJump, cutoff = 0, noiseSd = 0.6, seed } = opts;
  const rand = mulberry32(seed);
  const runningVariable: number[] = [];
  const outcome: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = (rand() - 0.5) * 2; // Uniform(-1, 1)
    const treated = x >= cutoff;
    const smooth = 1.5 * x + 0.8 * x * x;
    const y = smooth + (treated ? trueJump : 0) + randNormal(rand, 0, noiseSd);
    runningVariable.push(x);
    outcome.push(y);
  }
  return { data: { runningVariable, outcome, cutoff }, trueEffect: trueJump, seed };
}

/** Uplift: heterogeneous treatment effect depending on a single covariate, for Qini evaluation. */
export function generateUpliftDataset(opts: { n: number; seed: number }): GroundTruthDataset<UpliftRow[]> {
  const { n, seed } = opts;
  const rand = mulberry32(seed);
  const rows: UpliftRow[] = [];
  let totalUplift = 0;
  for (let i = 0; i < n; i++) {
    const x1 = randNormal(rand, 0, 1);
    const treated = rand() < 0.5;
    const trueUplift = 1 + 2 * Math.max(x1, 0); // only positive-x1 units respond
    const baseline = 3 + 0.5 * x1;
    const outcome = baseline + (treated ? trueUplift : 0) + randNormal(rand, 0, 1);
    rows.push({ covariates: [x1], treated, outcome });
    totalUplift += trueUplift;
  }
  return { data: rows, trueEffect: totalUplift / n, seed };
}
