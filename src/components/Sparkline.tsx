"use client";

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
}

/** Minimal inline-SVG sparkline, no external chart library. */
export default function Sparkline({ values, width = 80, height = 24, stroke = "#818cf8" }: SparklineProps) {
  if (values.length === 0) {
    return <svg width={width} height={height} aria-hidden />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / Math.max(1, values.length - 1);

  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const [lastX, lastY] = points.split(" ").at(-1)!.split(",").map(Number);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="trend sparkline">
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2} fill={stroke} />
    </svg>
  );
}
