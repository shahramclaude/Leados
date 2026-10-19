import { useId } from "react";

interface SparklineProps {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
  unit?: string;
  label?: string;
  /** Marks points more than 2 standard deviations from the series mean. */
  showAnomaly?: boolean;
  /** Extends the line with lighter-colored projected values. */
  showForecast?: number[];
  /** Draws a dot + direction arrow at the current (last real) value. */
  showCurrentDot?: boolean;
}

/**
 * Sparkline — inline SVG trend line, dark-themed. Keeps the original line
 * math (min/max scaling, slope-derived arrow) and extends it with optional
 * anomaly markers (±2σ) and a lighter-colored forecast tail.
 */
export function Sparkline({
  points,
  width = 240,
  height = 48,
  color = "var(--accent)",
  unit = "",
  label,
  showAnomaly = false,
  showForecast,
  showCurrentDot = false,
}: SparklineProps) {
  const uid = useId();
  const forecast = showForecast ?? [];
  const all = [...points, ...forecast];
  const pad = 4;
  const w = width;
  const h = height;

  const last3 = points.slice(-3);
  const slope = last3.length >= 2 ? last3[last3.length - 1] - last3[0] : 0;
  const arrow = slope > 0.01 ? "↗" : slope < -0.01 ? "↘" : "→";
  const min = Math.min(...all, 0);
  const max = Math.max(...all, 0.001);
  const range = max - min || 1;
  const n = all.length || 1;
  const x = (i: number) => pad + (i / (n - 1 || 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);
  const last = points[points.length - 1];

  const mean = points.reduce((a, b) => a + b, 0) / (points.length || 1);
  const variance = points.reduce((a, b) => a + (b - mean) ** 2, 0) / (points.length || 1);
  const sigma = Math.sqrt(variance);
  const isAnomaly = (v: number) => sigma > 0 && Math.abs(v - mean) > 2 * sigma;

  const titleId = `${uid}-t`;
  const descId = `${uid}-d`;
  const desc = `${label ?? "Series"} trend ${arrow}, last value ${last}${unit}`;

  const linePath = points.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)},${y(v)}`).join(" ");
  const forecastPath =
    forecast.length > 0
      ? [`M ${x(points.length - 1)},${y(points[points.length - 1])}`, ...forecast.map((v, i) => `L ${x(points.length + i)},${y(v)}`)].join(" ")
      : "";

  return (
    <span className="inline-flex items-center gap-2 align-middle">
      <svg role="img" aria-labelledby={`${titleId} ${descId}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <title id={titleId}>{label ?? "Sparkline"}</title>
        <desc id={descId}>{desc}</desc>

        <path d={linePath} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />

        {forecast.length > 0 && <path d={forecastPath} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="3 3" opacity={0.45} />}

        {showAnomaly &&
          points.map((v, i) =>
            isAnomaly(v) ? <circle key={i} cx={x(i)} cy={y(v)} r={2.6} fill="var(--bad)" stroke="var(--bg)" strokeWidth={0.75} /> : null
          )}

        {showCurrentDot && points.length > 0 && (
          <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r={2.75} fill={color} stroke="var(--bg)" strokeWidth={1} />
        )}
      </svg>
      <span className="font-mono-ui text-[11px]" style={{ color: "var(--text-muted)" }}>
        {typeof last === "number" ? last.toFixed(2) : last}
        {unit} {arrow}
      </span>
    </span>
  );
}
