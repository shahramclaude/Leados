import { CHART_DASH_PATTERNS, CHART_SERIES } from "../ui/tokens";
import type { ChartSeries } from "./types";

const MARKER_SHAPES = ["circle", "triangle", "diamond", "square", "cross"] as const;

function Marker({ shape, x, y, color }: { shape: (typeof MARKER_SHAPES)[number]; x: number; y: number; color: string }) {
  const size = 3.2;
  switch (shape) {
    case "triangle":
      return <polygon points={`${x},${y - size} ${x - size},${y + size} ${x + size},${y + size}`} fill={color} />;
    case "diamond":
      return <polygon points={`${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`} fill={color} />;
    case "square":
      return <rect x={x - size} y={y - size} width={size * 2} height={size * 2} fill={color} />;
    case "cross":
      return (
        <g stroke={color} strokeWidth={1.4}>
          <line x1={x - size} y1={y - size} x2={x + size} y2={y + size} />
          <line x1={x - size} y1={y + size} x2={x + size} y2={y - size} />
        </g>
      );
    default:
      return <circle cx={x} cy={y} r={size} fill={color} />;
  }
}

export interface LineSVGProps {
  series: ChartSeries[];
  width?: number;
  height?: number;
  yLabel?: string;
  /** When true (default) draws the p10-p90 credible band behind the line, if present. */
  showUncertainty?: boolean;
  valueFormat?: (value: number) => string;
}

/**
 * Axis-labelled multi-series line chart. Each series is distinguished by
 * color + dash pattern + marker shape (colorblind-safe) and a legend lists
 * all three encodings. Credible bands (p10-p90) render as a hatched area so
 * uncertainty reads even in grayscale printouts.
 */
export function LineSVG({ series, width = 560, height = 260, yLabel, showUncertainty = true, valueFormat }: LineSVGProps) {
  const margin = { top: 16, right: 16, bottom: 28, left: 48 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const allValues = series.flatMap((s) => s.points.flatMap((p) => [p.v, p.p10 ?? p.v, p.p90 ?? p.v]));
  const yMin = Math.min(...allValues, 0);
  const yMax = Math.max(...allValues, 1);
  const yPad = (yMax - yMin) * 0.1 || 1;
  const domainMin = yMin - yPad;
  const domainMax = yMax + yPad;

  const pointCount = Math.max(...series.map((s) => s.points.length), 1);
  const xStep = pointCount > 1 ? innerWidth / (pointCount - 1) : 0;

  function yScale(v: number) {
    return innerHeight - ((v - domainMin) / (domainMax - domainMin)) * innerHeight;
  }

  const fmt = valueFormat ?? ((v: number) => v.toFixed(1));
  const gridLines = 4;

  return (
    <figure className="flex flex-col gap-3">
      <svg width={width} height={height} role="img" aria-label={`Line chart${yLabel ? ` of ${yLabel}` : ""} with ${series.length} series`}>
        <g transform={`translate(${margin.left},${margin.top})`}>
          {Array.from({ length: gridLines + 1 }).map((_, i) => {
            const y = (innerHeight / gridLines) * i;
            const value = domainMax - ((domainMax - domainMin) / gridLines) * i;
            return (
              <g key={i}>
                <line x1={0} y1={y} x2={innerWidth} y2={y} stroke="var(--chart-grid)" strokeWidth={1} />
                <text x={-8} y={y} dy="0.32em" textAnchor="end" className="fill-text-muted font-mono text-[10px] tabular-nums">
                  {fmt(value)}
                </text>
              </g>
            );
          })}
          <line x1={0} y1={innerHeight} x2={innerWidth} y2={innerHeight} stroke="var(--chart-axis)" strokeWidth={1} />

          {series.map((s, sIndex) => {
            const color = s.colorVar ? `var(${s.colorVar})` : CHART_SERIES[sIndex % CHART_SERIES.length];
            const dash = s.dash ?? CHART_DASH_PATTERNS[sIndex % CHART_DASH_PATTERNS.length];
            const shape = MARKER_SHAPES[sIndex % MARKER_SHAPES.length];
            const linePoints = s.points.map((p, i) => `${i * xStep},${yScale(p.v)}`).join(" ");
            const hasBand = showUncertainty && s.points.some((p) => p.p10 !== undefined && p.p90 !== undefined);
            const bandPath = hasBand
              ? `M ${s.points.map((p, i) => `${i * xStep},${yScale(p.p90 ?? p.v)}`).join(" L ")} L ${[...s.points]
                  .reverse()
                  .map((p, i) => `${(s.points.length - 1 - i) * xStep},${yScale(p.p10 ?? p.v)}`)
                  .join(" L ")} Z`
              : null;

            return (
              <g key={s.id}>
                {bandPath ? (
                  <path d={bandPath} fill="var(--chart-band)" stroke={color} strokeOpacity={0.25} strokeDasharray="2 2" />
                ) : null}
                <polyline fill="none" stroke={color} strokeWidth={2} strokeDasharray={dash} points={linePoints} />
                {s.points.map((p, i) => (
                  <Marker key={p.t} shape={shape} x={i * xStep} y={yScale(p.v)} color={color} />
                ))}
              </g>
            );
          })}
        </g>
      </svg>
      <ul className="flex flex-wrap gap-4" aria-label="Legend">
        {series.map((s, sIndex) => {
          const color = s.colorVar ? `var(${s.colorVar})` : CHART_SERIES[sIndex % CHART_SERIES.length];
          return (
            <li key={s.id} className="flex items-center gap-1.5 text-xs text-text-secondary">
              <svg width={18} height={10} aria-hidden="true">
                <line x1={0} y1={5} x2={18} y2={5} stroke={color} strokeWidth={2} strokeDasharray={s.dash ?? CHART_DASH_PATTERNS[sIndex % CHART_DASH_PATTERNS.length]} />
              </svg>
              {s.label}
            </li>
          );
        })}
        {series.some((s) => s.points.some((p) => p.p10 !== undefined)) ? (
          <li className="flex items-center gap-1.5 text-xs text-text-muted">
            <span aria-hidden="true" className="inline-block h-2.5 w-4 rounded-sm" style={{ backgroundColor: "var(--chart-band)" }} />
            p10–p90 credible band
          </li>
        ) : null}
      </ul>
    </figure>
  );
}
