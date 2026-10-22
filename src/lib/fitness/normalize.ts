// LEADOS — Part 39: normalization of raw metrics into [0, 1] scores, and the
// analytic derivative of that normalization (used by the sensitivity panel).

import type { FitnessMetric } from "./types";

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Normalize a raw metric value to a [0, 1] "goodness" score.
 * higher_better: (value - min) / (max - min)
 * lower_better:  (max - value) / (max - min)
 * Clamped at the bounds. Bounds are policy-reviewed constants in dimensions.ts.
 */
export function normalizeMetric(metric: FitnessMetric, value: number): number {
  const span = metric.max - metric.min;
  if (span <= 0) return 0.5;
  const clamped = clamp(value, metric.min, metric.max);
  const frac = (clamped - metric.min) / span;
  return metric.direction === "higher_better" ? frac : 1 - frac;
}

/**
 * ∂(normalizedScore)/∂value at the given raw value. Zero outside the bounds
 * (the normalization is flat/clamped there), otherwise 1/span or -1/span.
 */
export function normalizeDerivative(metric: FitnessMetric, value: number): number {
  const span = metric.max - metric.min;
  if (span <= 0) return 0;
  if (value < metric.min || value > metric.max) return 0; // clamped region: locally flat
  return metric.direction === "higher_better" ? 1 / span : -1 / span;
}
