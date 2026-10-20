"use client";

import { memo, useMemo } from "react";

export type LineChartSeriesPoint = { x: number; y: number };

type LineChartProps = {
  points: LineChartSeriesPoint[];
  band?: { low: number; high: number }[];
  width?: number;
  height?: number;
  color?: string;
  label: string;
};

/**
 * Dependency-free SVG line chart. Deliberately avoids a charting library so
 * this component (and everything that imports it) stays tiny — it is loaded
 * via next/dynamic so it never lands in the initial route bundle.
 */
function LineChartImpl({ points, band, width = 560, height = 220, color = "#2563eb", label }: LineChartProps) {
  const { linePath, bandPath, minY, maxY } = useMemo(() => {
    if (points.length === 0) return { linePath: "", bandPath: "", minY: 0, maxY: 0 };

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y).concat(band ? band.flatMap((b) => [b.low, b.high]) : []);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys, 0);
    const maxY = Math.max(...ys, 1);

    const scaleX = (x: number) => ((x - minX) / Math.max(1, maxX - minX)) * (width - 32) + 16;
    const scaleY = (y: number) => height - 24 - ((y - minY) / Math.max(1, maxY - minY)) * (height - 40);

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${scaleX(p.x)},${scaleY(p.y)}`).join(" ");

    let bandPath = "";
    if (band && band.length === points.length) {
      const top = points.map((p, i) => `${i === 0 ? "M" : "L"}${scaleX(p.x)},${scaleY(band[i].high)}`).join(" ");
      const bottom = points
        .map((p, i) => `L${scaleX(p.x)},${scaleY(band[points.length - 1 - i].low)}`)
        .reverse()
        .join(" ");
      bandPath = `${top} ${points
        .slice()
        .reverse()
        .map((p, i) => `L${scaleX(p.x)},${scaleY(band[points.length - 1 - i].low)}`)
        .join(" ")} Z`;
      void bottom;
    }

    return { linePath, bandPath, minY, maxY };
  }, [points, band, width, height]);

  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">No data for {label}</div>
    );
  }

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{label}</title>
      {bandPath && <path d={bandPath} fill={color} opacity={0.12} stroke="none" />}
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <text x={16} y={16} fontSize={10} fill="#64748b">
        max {maxY.toFixed(0)}
      </text>
      <text x={16} y={height - 6} fontSize={10} fill="#64748b">
        min {minY.toFixed(0)}
      </text>
    </svg>
  );
}

export const LineChart = memo(LineChartImpl);
export default LineChart;
