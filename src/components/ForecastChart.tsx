"use client";

import { useMemo } from "react";
import { lttb } from "@/lib/mathUtils";

export interface ForecastPoint {
  week: number;
  p10: number;
  p50: number;
  p90: number;
}

const DOWNSAMPLE_THRESHOLD = 120;

/**
 * Renders a p10/p50/p90 band chart as plain SVG (no charting library —
 * deliberate bundle-discipline choice, see docs/PERFORMANCE.md "why no
 * recharts/visx"). Series longer than `DOWNSAMPLE_THRESHOLD` points are
 * reduced via LTTB (src/lib/mathUtils.ts) before touching the DOM, so a
 * multi-year weekly series never renders more SVG points than a short one —
 * this is the "progressive chart rendering" requirement from Phase 2.
 */
export function ForecastChart({ series }: { series: ForecastPoint[] }) {
  const { sampled, wasSampled } = useMemo(() => {
    if (series.length <= DOWNSAMPLE_THRESHOLD) return { sampled: series, wasSampled: false };
    const out = lttb(series, DOWNSAMPLE_THRESHOLD, (d) => d.week, (d) => d.p50);
    return { sampled: out, wasSampled: true };
  }, [series]);

  const width = 640;
  const height = 220;
  const pad = 28;

  const { minY, maxY } = useMemo(() => {
    const ys = sampled.flatMap((d) => [d.p10, d.p90]);
    return { minY: Math.min(...ys, 0), maxY: Math.max(...ys, 1) };
  }, [sampled]);

  const xScale = (week: number) => {
    const minX = sampled[0]?.week ?? 0;
    const maxX = sampled[sampled.length - 1]?.week ?? 1;
    const span = Math.max(maxX - minX, 1);
    return pad + ((week - minX) / span) * (width - 2 * pad);
  };
  const yScale = (v: number) => {
    const span = Math.max(maxY - minY, 1e-6);
    return height - pad - ((v - minY) / span) * (height - 2 * pad);
  };

  const bandPath = useMemo(() => {
    const top = sampled.map((d) => `${xScale(d.week)},${yScale(d.p90)}`).join(" L ");
    const bottom = [...sampled].reverse().map((d) => `${xScale(d.week)},${yScale(d.p10)}`).join(" L ");
    return `M ${top} L ${bottom} Z`;
  }, [sampled, minY, maxY]);

  const medianPath = useMemo(
    () => sampled.map((d, i) => `${i === 0 ? "M" : "L"} ${xScale(d.week)},${yScale(d.p50)}`).join(" "),
    [sampled, minY, maxY],
  );

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Forecast p10-p50-p90 band chart">
        <path d={bandPath} fill="rgb(99 102 241 / 0.15)" stroke="none" />
        <path d={medianPath} fill="none" stroke="rgb(79 70 229)" strokeWidth={2} />
      </svg>
      <p className="mt-1 text-xs text-slate-500">
        {wasSampled
          ? `Downsampled ${series.length} points -> ${sampled.length} via LTTB for render performance.`
          : `${series.length} points rendered directly (below downsample threshold).`}
      </p>
    </div>
  );
}
