export interface SparklineSVGProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  label: string;
}

/** Minimal inline trend indicator for StatTile slots. Still carries a real
 * aria-label describing the trend direction in words, since the glyph
 * alone is not meaningful to screen readers. */
export function SparklineSVG({ values, width = 96, height = 28, color = "var(--accent-default)", label }: SparklineSVGProps) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = max === min ? height / 2 : height - ((v - min) / (max - min)) * height;
    return `${x},${y}`;
  });
  const trend = values[values.length - 1] - values[0];
  const trendWord = trend > 0 ? "rising" : trend < 0 ? "falling" : "flat";

  return (
    <svg role="img" aria-label={`${label}: ${trendWord} trend`} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={points[points.length - 1].split(",")[0]} cy={points[points.length - 1].split(",")[1]} r={2} fill={color} />
    </svg>
  );
}
