"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

export interface SparklinePoint {
  x: number;
  y: number;
}

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** CSS color (token var) for the line. Position/length encodes the data —
   * color is identity only, never the primary channel (Cleveland–McGill:
   * position along a common scale outranks color). */
  color?: string;
  comparisonValue?: number;
  className?: string;
  ariaLabel: string;
}

/**
 * Sparkline — minimal line mark. Data-ink ratio target >= 0.6: the only
 * non-data ink is the optional comparison guide line and the end-point dot;
 * no axes, no gridlines, no background fill (those belong on a full chart).
 */
export function Sparkline({ data, width = 120, height = 32, color = "var(--chart-seq-5)", comparisonValue, className, ariaLabel }: SparklineProps) {
  const gradientId = useId();
  if (data.length === 0) return null;

  const min = Math.min(...data, comparisonValue ?? Infinity);
  const max = Math.max(...data, comparisonValue ?? -Infinity);
  const range = max - min || 1;

  const points: SparklinePoint[] = data.map((value, i) => ({
    x: (i / Math.max(1, data.length - 1)) * width,
    y: height - ((value - min) / range) * height,
  }));

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const last = points[points.length - 1];
  const comparisonY = comparisonValue !== undefined ? height - ((comparisonValue - min) / range) * height : null;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.18} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {comparisonY !== null && (
        <line
          x1={0}
          x2={width}
          y1={comparisonY}
          y2={comparisonY}
          stroke="var(--chart-axis-ink)"
          strokeDasharray="2 3"
          strokeWidth={1}
        />
      )}
      <path d={`${path} L${width},${height} L0,${height} Z`} fill={`url(#${gradientId})`} stroke="none" />
      <path d={path} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r={2.25} fill={color} />
    </svg>
  );
}
