// src/lib/fatigue.ts
//
// RECONSTRUCTION NOTE: see src/lib/circadian.ts header. Stand-in for the
// earlier fatigue module. This provides ONLY a descriptive statistic —
// "has this person's own self-rated decision quality drifted across the
// day, on their own records" — never a performance score, never compared
// across people. Every output carries a sample size and a confidence label
// so callers cannot present it as a fact (see the uncertainty-displayed
// lint in leaderState).

import { ALL_TIME_BUCKETS, bucketForHour, type TimeBucket } from "@/lib/circadian";

export interface RatedDecisionPoint {
  hourOfDay: number;
  /** Self-rated quality, 1 (regret it) .. 5 (confident it was right), optional. */
  selfRatedQuality: number;
}

export interface FatigueProxyBucket {
  bucket: TimeBucket;
  avgSelfRatedQuality: number | null;
  sampleSize: number;
}

export interface FatigueProxyResult {
  buckets: FatigueProxyBucket[];
  /** The bucket with the lowest average, if there is enough data to say anything. */
  lowestQualityBucket: TimeBucket | null;
  confidence: "insufficient-data" | "low" | "moderate";
  minBucketSampleSizeUsed: number;
}

const MIN_SAMPLE_PER_BUCKET_FOR_ANY_SIGNAL = 3;
const MIN_SAMPLE_PER_BUCKET_FOR_MODERATE_CONFIDENCE = 8;

/**
 * Decision-fatigue PROXY, not a measurement of fatigue itself. It looks for
 * drift in self-rated decision quality across the person's own time-of-day
 * buckets. This is explicitly a correlational, low-confidence proxy:
 * self-rating bias, recall bias, and unmeasured confounds (what was actually
 * decided, who was involved) are not controlled for. See AI-SESSION-LOG.md
 * "evidence basis" note.
 */
export function computeFatigueProxy(points: RatedDecisionPoint[]): FatigueProxyResult {
  const byBucket = new Map<TimeBucket, number[]>();
  for (const b of ALL_TIME_BUCKETS) byBucket.set(b, []);
  for (const p of points) {
    const bucket = bucketForHour(p.hourOfDay);
    byBucket.get(bucket)!.push(p.selfRatedQuality);
  }

  const buckets: FatigueProxyBucket[] = ALL_TIME_BUCKETS.map((bucket) => {
    const values = byBucket.get(bucket)!;
    return {
      bucket,
      avgSelfRatedQuality: values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length,
      sampleSize: values.length,
    };
  });

  const eligible = buckets.filter((b) => b.sampleSize >= MIN_SAMPLE_PER_BUCKET_FOR_ANY_SIGNAL && b.avgSelfRatedQuality !== null);
  const minBucketSampleSizeUsed = eligible.length === 0 ? 0 : Math.min(...eligible.map((b) => b.sampleSize));

  if (eligible.length < 2) {
    return { buckets, lowestQualityBucket: null, confidence: "insufficient-data", minBucketSampleSizeUsed };
  }

  const lowest = eligible.reduce((min, b) => (b.avgSelfRatedQuality! < min.avgSelfRatedQuality! ? b : min));
  const confidence = minBucketSampleSizeUsed >= MIN_SAMPLE_PER_BUCKET_FOR_MODERATE_CONFIDENCE ? "moderate" : "low";

  return { buckets, lowestQualityBucket: lowest.bucket, confidence, minBucketSampleSizeUsed };
}
