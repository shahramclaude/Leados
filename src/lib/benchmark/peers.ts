// Benchmark engine: honest peer-group construction + percentile computation.
//
// Honesty rules enforced here (Phase 5 self-attack target: "vanity
// percentiles"):
//   - Peer selection is a documented, deterministic k-nearest-neighbor
//     similarity method over declared features — never hand-picked flattering
//     peers. The exact criteria/weights used are returned alongside the
//     result so the UI can show (and let users edit) the peer definition.
//   - Sample-size honesty: below MIN_SAMPLE_FOR_PERCENTILE peers, we refuse
//     to produce a percentile and instead return a `lowSample` flag with a
//     plain-language caveat.

export interface OrgFeatureVector {
  orgId: number;
  name: string;
  isSelf: boolean;
  features: Record<string, number>; // e.g. { revenueUsd, headcount, growthRateYoy, grossMarginPct }
}

export interface PeerGroupResult {
  method: string;
  featureWeights: Record<string, number>;
  k: number;
  peerOrgIds: number[];
  rationale: string;
}

export const MIN_SAMPLE_FOR_PERCENTILE = 5;

function zScoreNormalize(values: number[]): number[] {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  if (std === 0) return values.map(() => 0);
  return values.map((v) => (v - mean) / std);
}

/**
 * k-nearest-neighbor peer construction over z-score-normalized, weighted
 * Euclidean distance across the provided feature set. Deterministic: given
 * the same inputs, always returns the same peers in the same order (ties
 * broken by orgId ascending) — not arbitrary/curated.
 */
export function constructPeerGroup(
  orgs: OrgFeatureVector[],
  targetOrgId: number,
  opts: { featureWeights?: Record<string, number>; k?: number } = {},
): PeerGroupResult {
  const target = orgs.find((o) => o.orgId === targetOrgId);
  if (!target) throw new Error(`constructPeerGroup: target org ${targetOrgId} not found`);

  const featureNames = Object.keys(target.features);
  const weights = opts.featureWeights ?? Object.fromEntries(featureNames.map((f) => [f, 1]));
  const k = opts.k ?? 8;

  const candidates = orgs.filter((o) => o.orgId !== targetOrgId);

  // Normalize each feature across the full candidate+target population.
  const population = [target, ...candidates];
  const normalized: Record<number, Record<string, number>> = {};
  for (const feature of featureNames) {
    const raw = population.map((o) => o.features[feature] ?? 0);
    const z = zScoreNormalize(raw);
    population.forEach((o, i) => {
      normalized[o.orgId] = normalized[o.orgId] ?? {};
      normalized[o.orgId][feature] = z[i];
    });
  }

  const distances = candidates
    .map((o) => {
      let sumSq = 0;
      for (const feature of featureNames) {
        const w = weights[feature] ?? 1;
        const diff = (normalized[target.orgId][feature] ?? 0) - (normalized[o.orgId][feature] ?? 0);
        sumSq += w * diff * diff;
      }
      return { orgId: o.orgId, distance: Math.sqrt(sumSq) };
    })
    .sort((a, b) => (a.distance === b.distance ? a.orgId - b.orgId : a.distance - b.distance));

  const peerOrgIds = distances.slice(0, k).map((d) => d.orgId);

  return {
    method: "k_nearest_zscore",
    featureWeights: weights,
    k,
    peerOrgIds,
    rationale: `k-nearest-neighbor (k=${k}) on z-score-normalized, weighted Euclidean distance over features [${featureNames.join(
      ", ",
    )}]. Deterministic and reproducible — not manually curated. Edit feature weights to change the peer definition.`,
  };
}

export interface PercentileResult {
  percentile: number | null; // null when sample too small
  sampleSize: number;
  lowSample: boolean;
  methodBadge: string;
}

/** Percentile of `value` within `distribution`, with sample-size honesty. */
export function computePercentile(value: number, distribution: number[]): PercentileResult {
  const sampleSize = distribution.length;
  const lowSample = sampleSize < MIN_SAMPLE_FOR_PERCENTILE;

  if (lowSample) {
    return {
      percentile: null,
      sampleSize,
      lowSample: true,
      methodBadge: `Insufficient sample (n=${sampleSize} < ${MIN_SAMPLE_FOR_PERCENTILE}) — percentile withheld`,
    };
  }

  const below = distribution.filter((d) => d < value).length;
  const equal = distribution.filter((d) => d === value).length;
  const percentile = ((below + 0.5 * equal) / sampleSize) * 100;

  return {
    percentile: Number(percentile.toFixed(1)),
    sampleSize,
    lowSample: false,
    methodBadge: `Empirical percentile over peer group, n=${sampleSize}`,
  };
}
