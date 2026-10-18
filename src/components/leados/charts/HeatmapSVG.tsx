"use client";

import { useState } from "react";

interface HeatmapSVGProps {
  keys: string[];
  matrix: number[][];
  labels?: Record<string, string>;
  cellSize?: number;
  onCellHover?: (a: string, b: string, value: number) => void;
}

/** Diverging color scale: blue (negative) -> white (zero) -> red (positive). */
function diverging(value: number): string {
  const v = Math.max(-1, Math.min(1, value));
  if (v >= 0) {
    const t = v; // 0..1
    const r = 255;
    const g = Math.round(255 - t * 150);
    const b = Math.round(255 - t * 220);
    return `rgb(${r},${g},${b})`;
  }
  const t = -v;
  const r = Math.round(255 - t * 220);
  const g = Math.round(255 - t * 150);
  const b = 255;
  return `rgb(${r},${g},${b})`;
}

export function HeatmapSVG({ keys, matrix, labels, cellSize = 34 }: HeatmapSVGProps) {
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  const labelWidth = 150;
  const n = keys.length;
  const width = labelWidth + n * cellSize + 20;
  const height = labelWidth + n * cellSize + 20;

  if (n < 2) {
    return <p className="text-sm text-slate-400">Need at least two metrics with overlapping history to correlate.</p>;
  }

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {/* column labels (rotated) along the top-left diagonal edge */}
      {keys.map((k, j) => (
        <text
          key={`col-${k}`}
          x={labelWidth + j * cellSize + cellSize / 2}
          y={labelWidth - 6}
          fontSize={10}
          textAnchor="start"
          transform={`rotate(-45 ${labelWidth + j * cellSize + cellSize / 2} ${labelWidth - 6})`}
          className="fill-slate-500"
        >
          {labels?.[k] ?? k}
        </text>
      ))}

      {/* row labels */}
      {keys.map((k, i) => (
        <text
          key={`row-${k}`}
          x={labelWidth - 8}
          y={labelWidth + i * cellSize + cellSize / 2}
          fontSize={10}
          textAnchor="end"
          dominantBaseline="middle"
          className="fill-slate-500"
        >
          {labels?.[k] ?? k}
        </text>
      ))}

      {/* lower-triangle cells only (i >= j) */}
      {keys.map((_, i) =>
        keys.map((_, j) => {
          if (j > i) return null;
          const value = matrix[i]?.[j] ?? 0;
          const isHover = hover?.i === i && hover?.j === j;
          return (
            <g key={`${i}-${j}`} onMouseEnter={() => setHover({ i, j })} onMouseLeave={() => setHover(null)}>
              <rect
                x={labelWidth + j * cellSize}
                y={labelWidth + i * cellSize}
                width={cellSize - 2}
                height={cellSize - 2}
                fill={diverging(i === j ? 1 : value)}
                stroke={isHover ? "#0f172a" : Math.abs(value) > 0.7 && i !== j ? "#0f172a" : "#e2e8f0"}
                strokeWidth={isHover ? 2 : Math.abs(value) > 0.7 && i !== j ? 1.5 : 1}
                rx={3}
              />
              {cellSize >= 28 && (
                <text
                  x={labelWidth + j * cellSize + cellSize / 2}
                  y={labelWidth + i * cellSize + cellSize / 2}
                  fontSize={9}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className={Math.abs(value) > 0.5 ? "fill-white" : "fill-slate-600"}
                >
                  {i === j ? "1.0" : value.toFixed(2)}
                </text>
              )}
            </g>
          );
        }),
      )}
    </svg>
  );
}
