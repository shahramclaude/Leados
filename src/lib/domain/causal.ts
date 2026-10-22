import type { Prng } from "@/lib/prng";

/**
 * Minimal structural causal model (SCM) + backdoor-adjustment estimator.
 *
 * Generates synthetic observational data from a known data-generating
 * process (a confounded treatment assignment) and then recovers the
 * average treatment effect (ATE) via multivariate linear regression,
 * adjusting for the observed confounder. This lets tests assert that the
 * *true* causal effect baked into the generator can be *recovered* from
 * the *observed* (confounded) data — the central correctness property for
 * any causal-inference code path in LEADOS (e.g. "did this automation
 * actually cause the decision-cycle-time improvement, or is it just
 * correlated with teams that were already improving?").
 */

export interface ScmConfig {
  /** True causal effect of treatment T on outcome Y (what we try to recover). */
  readonly trueEffect: number;
  /** Effect of the confounder X on the outcome Y. */
  readonly confounderOutcomeWeight: number;
  /** Effect of the confounder X on treatment propensity (the confounding). */
  readonly confounderTreatmentWeight: number;
  /** Std-dev of the additive outcome noise. */
  readonly noiseStdDev: number;
  readonly sampleSize: number;
}

export interface ObservedRow {
  readonly x: number;
  readonly t: number; // 0 or 1
  readonly y: number;
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/** Generate confounded observational data from a known SCM, fully seeded. */
export function generateObservationalData(
  prng: Prng,
  config: ScmConfig,
): ObservedRow[] {
  const rows: ObservedRow[] = [];
  for (let i = 0; i < config.sampleSize; i++) {
    const x = prng.nextGaussian(0, 1);
    const propensity = sigmoid(config.confounderTreatmentWeight * x);
    const t = prng.next() < propensity ? 1 : 0;
    const noise = prng.nextGaussian(0, config.noiseStdDev);
    const y =
      config.trueEffect * t + config.confounderOutcomeWeight * x + noise;
    rows.push({ x, t, y });
  }
  return rows;
}

/** Naive (biased) estimator: raw difference in means, ignoring confounding. */
export function naiveDifferenceInMeans(rows: readonly ObservedRow[]): number {
  const treated = rows.filter((r) => r.t === 1);
  const control = rows.filter((r) => r.t === 0);
  const mean = (xs: readonly ObservedRow[]) =>
    xs.reduce((a, r) => a + r.y, 0) / xs.length;
  return mean(treated) - mean(control);
}

/**
 * Backdoor-adjusted estimator: OLS regression of Y on [1, T, X]. The
 * coefficient on T is the adjusted estimate of the causal effect,
 * consistent (in expectation, as sampleSize grows) for the true effect
 * because X is the only confounder and it is observed.
 */
export function backdoorAdjustedEstimate(rows: readonly ObservedRow[]): number {
  // Solve normal equations (X^T X) beta = X^T y for design matrix
  // columns [intercept, T, X] via closed-form 3x3 solve.
  const n = rows.length;
  if (n < 3) throw new Error("Need at least 3 observations to regress");

  let sT = 0, sX = 0, sTT = 0, sXX = 0, sTX = 0;
  let sY = 0, sTY = 0, sXY = 0;
  for (const r of rows) {
    sT += r.t;
    sX += r.x;
    sTT += r.t * r.t;
    sXX += r.x * r.x;
    sTX += r.t * r.x;
    sY += r.y;
    sTY += r.t * r.y;
    sXY += r.x * r.y;
  }

  // Normal equations matrix A * beta = b where beta = [b0, bT, bX]
  const A = [
    [n, sT, sX],
    [sT, sTT, sTX],
    [sX, sTX, sXX],
  ];
  const b = [sY, sTY, sXY];

  const beta = solve3x3(A, b);
  return beta[1]; // coefficient on T
}

/** Solve a 3x3 linear system via Cramer's rule. */
function solve3x3(A: number[][], b: number[]): number[] {
  const det3 = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

  const detA = det3(A);
  if (Math.abs(detA) < 1e-9) {
    throw new Error(
      "Design matrix is (near-)singular — insufficient variation in T or X",
    );
  }

  const replaceCol = (col: number) =>
    A.map((row, i) => row.map((v, j) => (j === col ? b[i] : v)));

  return [0, 1, 2].map((col) => det3(replaceCol(col)) / detA);
}
