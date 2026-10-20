"use client";

import { useId, useState } from "react";
import type { ReactElement } from "react";
import type { Series } from "./types";

export interface LineSVGProps {
  series: Series[];
  width?: number;
  height?: number;
  yFormatter?: (n: number) => string;
  /** If true, the y-axis starts at zero (default). Set false only when the
   * caller documents why in the chart's footnote — truncated axes can
   * mislead, so this is opt-in and loud. */
  zeroBaseline?: boolean;
}

const MARKER_PATHS: Record<NonNullable<Series["marker"]>, (x: number, y: number) => ReactElement> = {
  circle: (x, y) => <circle cx={x} cy={y} r={3} />,
  square: (x, y) => <rect x={x - 3} y={y - 3} width={6} height={6} />,
  triangle: (x, y) => <polygon points={`${x},${y - 4} ${x - 4},${y + 3} ${x + 4},${y + 3}`} />,
  diamond: (x, y) => <polygon points={`${x},${y - 4} ${x + 4},${y} ${x},${y + 4} ${x - 4},${y}`} />,
};

/** Line chart with first-class uncertainty bands (low/high rendered as a
 * translucent area behind the line) and shape markers per series so
 * overlapping lines remain distinguishable without relying on color. */
export function LineSVG({ series, width = 560, height = 220, yFormatter = (n) => n.toLocaleString(), zeroBaseline = true }: LineSVGProps) {
  const id = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const padding = { top: 16, right: 16, bottom: 28, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const allY = series.flatMap((s) => s.points.flatMap((p) => [p.y, p.low ?? p.y, p.high ?? p.y]));
  const maxY = Math.max(...allY, 1);
  const minY = zeroBaseline ? 0 : Math.min(...allY);
  const n = series[0]?.points.length ?? 0;

  function xAt(i: number) {
    return padding.left + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
  }
  function yAt(v: number) {
    const ratio = maxY === minY ? 0 : (v - minY) / (maxY - minY);
    return padding.top + innerH - ratio * innerH;
  }

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => minY + ((maxY - minY) * i) / yTicks);

  return (
    <div className="relative">
      <svg
        role="img"
        aria-label={`Line chart: ${series.map((s) => s.label).join(", ")}`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padding.left} x2={width - padding.right} y1={yAt(t)} y2={yAt(t)} stroke="var(--border-subtle)" strokeWidth={1} />
            <text x={padding.left - 8} y={yAt(t) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">
              {yFormatter(t)}
            </text>
          </g>
        ))}

        {series.map((s) => {
          const hasBand = s.points.some((p) => p.low !== undefined && p.high !== undefined);
          const areaPath = hasBand
            ? `M ${s.points.map((p, i) => `${xAt(i)},${yAt(p.high ?? p.y)}`).join(" L ")} L ${s.points
                .slice()
                .reverse()
                .map((p, i) => `${xAt(s.points.length - 1 - i)},${yAt(p.low ?? p.y)}`)
                .join(" L ")} Z`
            : null;
          const linePath = `M ${s.points.map((p, i) => `${xAt(i)},${yAt(p.y)}`).join(" L ")}`;
          return (
            <g key={s.id}>
              {areaPath && <path d={areaPath} fill={s.color} opacity={0.12} stroke="none" />}
              <path d={linePath} fill="none" stroke={s.color} strokeWidth={2} />
              {s.points.map((p, i) => (
                <g key={i} fill={s.color}>
                  {MARKER_PATHS[s.marker ?? "circle"](xAt(i), yAt(p.y))}
                </g>
              ))}
            </g>
          );
        })}

        {series[0]?.points.map((p, i) => (
          <rect
            key={i}
            x={xAt(i) - innerW / Math.max(1, n) / 2}
            y={padding.top}
            width={innerW / Math.max(1, n)}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHoverIndex(i)}
          />
        ))}

        {series[0]?.points.map(
          (p, i) =>
            i % Math.ceil(n / 6 || 1) === 0 && (
              <text key={i} x={xAt(i)} y={height - 8} textAnchor="middle" fontSize={10} fill="var(--text-muted)">
                {p.x}
              </text>
            ),
        )}

        {hoverIndex !== null && <line x1={xAt(hoverIndex)} x2={xAt(hoverIndex)} y1={padding.top} y2={height - padding.bottom} stroke="var(--border-strong)" strokeDasharray="2 2" />}
      </svg>
      {hoverIndex !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-overlay)] p-[var(--space-2)] text-[var(--text-xs)] shadow-[var(--shadow-md)]"
          style={{ left: Math.min(width - 160, Math.max(0, xAt(hoverIndex) - 60)) }}
        >
          <p className="font-medium text-[var(--text-primary)]">{series[0]?.points[hoverIndex]?.x}</p>
          {series.map((s) => {
            const p = s.points[hoverIndex];
            if (!p) return null;
            return (
              <p key={s.id} className="flex items-center gap-1" style={{ color: s.color }}>
                <span aria-hidden>●</span>
                <span className="text-[var(--text-secondary)]">
                  {s.label}: {yFormatter(p.y)}
                  {p.low !== undefined && p.high !== undefined ? ` (${yFormatter(p.low)}–${yFormatter(p.high)})` : ""}
                </span>
              </p>
            );
          })}
        </div>
      )}
      <p id={`${id}-note`} className="sr-only">
        Use the &quot;view as table&quot; toggle for a screen-reader-friendly version of this chart.
      </p>
    </div>
  );
}
