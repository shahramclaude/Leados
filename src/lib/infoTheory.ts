// ---------------------------------------------------------------------------
// infoTheory.ts — information-theoretic helpers used to qualify the
// confidence of statistical associations (e.g. causal hypotheses).
// Shannon (1948) textbook formulas. Not from any file in this repo.
// ---------------------------------------------------------------------------

/** Shannon entropy in bits for a discrete probability distribution. */
export function entropy(probabilities: number[]): number {
  const total = probabilities.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const p of probabilities) {
    const normalized = p / total;
    if (normalized > 0) h -= normalized * Math.log2(normalized);
  }
  return h;
}

/** Kullback-Leibler divergence D_KL(P || Q) in bits. */
export function klDivergence(p: number[], q: number[]): number {
  const n = Math.min(p.length, q.length);
  let d = 0;
  for (let i = 0; i < n; i++) {
    if (p[i] <= 0) continue;
    const qi = q[i] <= 0 ? 1e-9 : q[i];
    d += p[i] * Math.log2(p[i] / qi);
  }
  return d;
}

/**
 * Approximate mutual information (in bits) between two jointly-Gaussian
 * variables given their Pearson correlation coefficient r:
 *   MI = -0.5 * log2(1 - r^2)
 * Standard closed-form result for bivariate normal variables, used here only
 * as an auxiliary strength signal — NOT used to establish causation.
 */
export function mutualInformationFromCorrelation(r: number): number {
  const clamped = Math.max(-0.999999, Math.min(0.999999, r));
  return -0.5 * Math.log2(1 - clamped * clamped);
}
