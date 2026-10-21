"use client";

import { cn } from "@/lib/cn";

export interface MiniBarDatum {
  label: string;
  value: number;
}

export interface MiniBarChartProps {
  data: MiniBarDatum[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
  ariaLabel: string;
}

/**
 * MiniBarChart — bars encode magnitude via LENGTH (Cleveland–McGill rank 2,
 * right behind position-on-common-scale), which is why bar charts beat pies
 * for this kind of comparison. Axis ink is a single baseline; no gridlines
 * (data-ink ratio target >= 0.6 — see docs/DESIGN-SYSTEM.md §4).
 */
export function MiniBarChart({ data, width = 160, height = 48, color = "var(--chart-seq-5)", className, ariaLabel }: MiniBarChartProps) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 0.0001);
  const gap = 4;
  const barWidth = (width - gap * (data.length - 1)) / data.length;

  return (
    <figure className={cn("inline-block", className)}>
      <svg role="img" aria-label={ariaLabel} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1={0} x2={width} y1={height - 1} y2={height - 1} stroke="var(--chart-gridline)" strokeWidth={1} />
        {data.map((d, i) => {
          const barHeight = (d.value / max) * (height - 4);
          const x = i * (barWidth + gap);
          const y = height - barHeight - 1;
          return <rect key={d.label} x={x} y={y} width={barWidth} height={barHeight} rx={2} fill={color} />;
        })}
      </svg>
    </figure>
  );
}
