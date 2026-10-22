import type { ForesightClaim } from "./registry";

export interface CalibrationBucket {
  bucketLabel: string;
  bucketMin: number;
  bucketMax: number;
  claimCount: number;
  avgConfidence: number;
  actualFrequency: number;
}

/**
 * Bucket resolved claims by stated confidence and compare to actual
 * resolution frequency — the classic reliability-diagram view of
 * calibration. A well-calibrated org's claims at "70% confident" resolve
 * true about 70% of the time.
 */
export function calibrationBuckets(claims: ForesightClaim[], bucketSize = 0.2): CalibrationBucket[] {
  const resolved = claims.filter((c) => c.status === "resolved" && c.outcome !== undefined);
  const buckets: CalibrationBucket[] = [];
  for (let lo = 0; lo < 1; lo += bucketSize) {
    const hi = Math.min(1, lo + bucketSize);
    const inBucket = resolved.filter((c) => c.confidence >= lo && (hi === 1 ? c.confidence <= hi : c.confidence < hi));
    if (inBucket.length === 0) {
      buckets.push({ bucketLabel: `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`, bucketMin: lo, bucketMax: hi, claimCount: 0, avgConfidence: NaN, actualFrequency: NaN });
      continue;
    }
    const avgConfidence = inBucket.reduce((s, c) => s + c.confidence, 0) / inBucket.length;
    const actualFrequency = inBucket.filter((c) => c.outcome).length / inBucket.length;
    buckets.push({ bucketLabel: `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`, bucketMin: lo, bucketMax: hi, claimCount: inBucket.length, avgConfidence, actualFrequency });
  }
  return buckets;
}

export interface ForesightCalibrationSummary {
  resolvedCount: number;
  openCount: number;
  brier: number;
  buckets: CalibrationBucket[];
}

export function summarizeCalibration(claims: ForesightClaim[]): ForesightCalibrationSummary {
  const resolved = claims.filter((c) => c.status === "resolved");
  const open = claims.filter((c) => c.status === "open");
  const brier = resolved.length ? resolved.reduce((s, c) => s + (c.brierComponent ?? 0), 0) / resolved.length : NaN;
  return { resolvedCount: resolved.length, openCount: open.length, brier, buckets: calibrationBuckets(claims) };
}
