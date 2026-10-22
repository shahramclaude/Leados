// Part 28 — EWMA trend utility.
//
// PROVENANCE NOTE: the standing order references "Part 04's EWMA" utility.
// That module is not present in this repo snapshot, so this is a local,
// minimal, drop-in-compatible implementation (standard exponentially
// weighted moving average over an ordered time series) scoped to what the
// queueing/bottleneck trend views need. If/when Part 04 lands, this should
// be replaced by an import from its shared utility instead of kept as a
// parallel implementation.
import type { EwmaPoint, EwmaTrend } from "./types";

export function computeEwmaTrend(
  series: { periodStart: Date; value: number }[],
  alpha = 0.3,
): EwmaTrend {
  const sorted = [...series].sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
  const points: EwmaPoint[] = [];
  let prevEwma: number | null = null;
  for (const point of sorted) {
    const ewma: number = prevEwma === null ? point.value : alpha * point.value + (1 - alpha) * prevEwma;
    points.push({ periodStart: point.periodStart, raw: point.value, ewma });
    prevEwma = ewma;
  }

  let direction: EwmaTrend["direction"] = "stable";
  let slopePerPeriod = 0;
  if (points.length >= 2) {
    const first = points[0].ewma;
    const last = points[points.length - 1].ewma;
    slopePerPeriod = (last - first) / (points.length - 1);
    const relativeChange = first === 0 ? (last === 0 ? 0 : 1) : (last - first) / Math.abs(first);
    if (relativeChange > 0.1) direction = "rising";
    else if (relativeChange < -0.1) direction = "falling";
  }

  return { alpha, points, direction, slopePerPeriod };
}
