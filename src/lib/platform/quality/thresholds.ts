// src/lib/platform/quality/thresholds.ts
//
// Per-dimension gate thresholds. Scores below threshold cause a "low-quality
// input" chip on the relevant surface (Data Sources, Import Studio) — they do
// NOT, by themselves, delete data. Only the row-level hard gate (see
// engine.ts `HARD_QUARANTINE_REASONS`) removes rows from the commit set.
export type QualityDimension =
  | "completeness"
  | "validity"
  | "uniqueness"
  | "timeliness"
  | "consistency"
  | "accuracyProxy";

export const QUALITY_DIMENSIONS: QualityDimension[] = [
  "completeness",
  "validity",
  "uniqueness",
  "timeliness",
  "consistency",
  "accuracyProxy",
];

export const QUALITY_THRESHOLDS: Record<QualityDimension, number> = {
  completeness: 0.9,
  validity: 0.95,
  uniqueness: 0.9,
  // Timeliness is informational: many sources never send freshness metadata at all.
  timeliness: 0.5,
  consistency: 0.9,
  // accuracyProxy has no independent ground truth in this system — threshold kept
  // low deliberately and the UI always marks it `isProxy: true` (honesty rule).
  accuracyProxy: 0.6,
};

export const STALENESS_DAYS = 400;
