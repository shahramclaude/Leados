// Part 28 — Individuals (X-mR) control chart.
//
// PROVENANCE NOTE: the standing order references "Part 13" control charts.
// That module is not present in this repo snapshot, so this is a local,
// minimal implementation of a standard individuals/moving-range chart,
// scoped to drift-detection on process metrics. Replace with Part 13's
// shared implementation once it exists in this repo.
import type { ControlChart, ControlChartPoint } from "./types";

const MR_CONSTANT = 2.66; // standard constant for individuals charts (d2 for n=2)

export function computeControlChart(
  metric: string,
  series: { periodStart: Date; value: number }[],
): ControlChart {
  const sorted = [...series].sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
  const values = sorted.map((s) => s.value);
  const n = values.length;

  if (n === 0) {
    return { metric, mean: 0, ucl: 0, lcl: 0, points: [] };
  }

  const meanValue = values.reduce((a, b) => a + b, 0) / n;

  const movingRanges: number[] = [];
  for (let i = 1; i < n; i++) {
    movingRanges.push(Math.abs(values[i] - values[i - 1]));
  }
  const mrBar = movingRanges.length ? movingRanges.reduce((a, b) => a + b, 0) / movingRanges.length : 0;

  const ucl = meanValue + MR_CONSTANT * mrBar;
  const lcl = Math.max(0, meanValue - MR_CONSTANT * mrBar);

  const points: ControlChartPoint[] = sorted.map((s) => ({
    periodStart: s.periodStart,
    value: s.value,
    outOfControl: s.value > ucl || s.value < lcl,
  }));

  return { metric, mean: meanValue, ucl, lcl, points };
}
